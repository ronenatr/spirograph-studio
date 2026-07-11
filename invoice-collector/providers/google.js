import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import { parseAmount } from './amount.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, '..', 'token.google.json');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

// Keywords that mark an email as an invoice or a receipt (English + Hebrew).
const KEYWORDS = [
  'invoice',
  'receipt',
  'tax invoice',
  'order confirmation',
  'payment',
  'חשבונית',
  'חשבונית מס',
  'קבלה',
  'אישור תשלום',
];

export const id = 'google';
export const name = 'Gmail';

function env() {
  const PORT = process.env.PORT || 3000;
  return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/oauth2callback/google`,
  };
}

export function isConfigured() {
  const { clientId, clientSecret } = env();
  return Boolean(clientId && clientSecret);
}

function makeClient() {
  const { clientId, clientSecret, redirectUri } = env();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function loadTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  } catch {
    return null;
  }
}
function saveTokens(t) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(t, null, 2));
}

function authedClient() {
  const tokens = loadTokens();
  if (!tokens) return null;
  const client = makeClient();
  client.setCredentials(tokens);
  client.on('tokens', (t) => saveTokens({ ...loadTokens(), ...t }));
  return client;
}

export function authUrl() {
  return makeClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

export async function handleCallback(code) {
  const client = makeClient();
  const { tokens } = await client.getToken(code);
  saveTokens(tokens);
}

export function logout() {
  try {
    fs.unlinkSync(TOKEN_PATH);
  } catch {
    /* already gone */
  }
}

export async function status() {
  const client = authedClient();
  if (!client) return { connected: false };
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();
    return { connected: true, email: data.email };
  } catch {
    return { connected: true };
  }
}

function toGmailDate(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

function buildQuery({ from, to, attachmentsOnly }) {
  const parts = [];
  parts.push(`{${KEYWORDS.map((k) => (k.includes(' ') ? `"${k}"` : k)).join(' ')}}`);
  if (from) parts.push(`after:${toGmailDate(from)}`);
  if (to) {
    const d = new Date(to);
    d.setDate(d.getDate() + 1); // inclusive of the "to" day
    parts.push(`before:${toGmailDate(d)}`);
  }
  if (attachmentsOnly) parts.push('has:attachment');
  return parts.join(' ');
}

function headerValue(headers, nameWanted) {
  const h = headers.find((x) => x.name.toLowerCase() === nameWanted.toLowerCase());
  return h ? h.value : '';
}

function collectAttachments(payload, acc = []) {
  if (!payload) return acc;
  const { filename, body, parts } = payload;
  if (filename && body && body.attachmentId) {
    acc.push({
      filename,
      mimeType: payload.mimeType,
      size: body.size || 0,
      attachmentId: body.attachmentId,
    });
  }
  if (parts) parts.forEach((p) => collectAttachments(p, acc));
  return acc;
}

export async function searchInvoices({ from, to, attachmentsOnly }) {
  const client = authedClient();
  if (!client) return { error: 'not_connected' };

  const gmail = google.gmail({ version: 'v1', auth: client });
  const q = buildQuery({ from, to, attachmentsOnly });

  const MAX = 250;
  const ids = [];
  let pageToken;
  do {
    const list = await gmail.users.messages.list({
      userId: 'me',
      q,
      maxResults: 100,
      pageToken,
    });
    (list.data.messages || []).forEach((m) => ids.push(m.id));
    pageToken = list.data.nextPageToken;
  } while (pageToken && ids.length < MAX);

  const limited = ids.slice(0, MAX);
  const results = [];
  const BATCH = 10;
  for (let i = 0; i < limited.length; i += BATCH) {
    const chunk = limited.slice(i, i + BATCH);
    const msgs = await Promise.all(
      chunk.map((mid) =>
        gmail.users.messages
          .get({ userId: 'me', id: mid, format: 'full' })
          .then((r) => r.data)
          .catch(() => null)
      )
    );
    for (const msg of msgs) {
      if (!msg) continue;
      const headers = msg.payload?.headers || [];
      const subject = headerValue(headers, 'Subject');
      const amount = parseAmount(subject) || parseAmount(msg.snippet);
      results.push({
        id: msg.id,
        provider: id,
        subject,
        from: headerValue(headers, 'From'),
        date: (() => {
          const d = headerValue(headers, 'Date');
          return d ? new Date(d).toISOString() : null;
        })(),
        snippet: msg.snippet || '',
        amount: amount?.display || '',
        amountValue: amount?.value ?? null,
        amountCurrency: amount?.currency || '',
        attachments: collectAttachments(msg.payload),
      });
    }
  }

  results.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return { query: q, count: results.length, truncated: ids.length >= MAX, results };
}

export async function getAttachment({ messageId, attachmentId }) {
  const client = authedClient();
  if (!client) return null;
  const gmail = google.gmail({ version: 'v1', auth: client });
  const { data } = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });
  return { buffer: Buffer.from(data.data, 'base64url') };
}
