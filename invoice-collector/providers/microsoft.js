import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAmount, parseTotalAmount, htmlToText } from './amount.js';
import { extractLinks } from './links.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, '..', 'token.microsoft.json');

const AUTH_BASE = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = ['offline_access', 'openid', 'email', 'profile', 'Mail.Read', 'User.Read'];

const KEYWORDS = [
  'invoice',
  'receipt',
  '"tax invoice"',
  'payment',
  'חשבונית',
  'קבלה',
];

export const id = 'microsoft';
export const name = 'Outlook';

function env() {
  const PORT = process.env.PORT || 3000;
  return {
    clientId: process.env.MS_CLIENT_ID,
    clientSecret: process.env.MS_CLIENT_SECRET,
    redirectUri:
      process.env.MS_REDIRECT_URI || `http://localhost:${PORT}/oauth2callback/microsoft`,
  };
}

export function isConfigured() {
  const { clientId, clientSecret } = env();
  return Boolean(clientId && clientSecret);
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

export function authUrl() {
  const { clientId, redirectUri } = env();
  const p = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: SCOPES.join(' '),
    prompt: 'consent',
  });
  return `${AUTH_BASE}/authorize?${p.toString()}`;
}

export async function handleCallback(code) {
  const { clientId, clientSecret, redirectUri } = env();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: SCOPES.join(' '),
  });
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  const tokens = await res.json();
  saveTokens(tokens);
}

export function logout() {
  try {
    fs.unlinkSync(TOKEN_PATH);
  } catch {
    /* already gone */
  }
}

async function refreshAccessToken(tokens) {
  const { clientId, clientSecret } = env();
  if (!tokens?.refresh_token) return null;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token',
    scope: SCOPES.join(' '),
  });
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) return null;
  const fresh = await res.json();
  const merged = { ...tokens, ...fresh };
  saveTokens(merged);
  return merged;
}

/** Calls Graph with the stored token, refreshing once on 401. */
async function graph(url, tokens) {
  let t = tokens;
  let res = await fetch(url, { headers: { Authorization: `Bearer ${t.access_token}` } });
  if (res.status === 401) {
    t = await refreshAccessToken(t);
    if (!t) return { ok: false, status: 401, refreshed: false };
    res = await fetch(url, { headers: { Authorization: `Bearer ${t.access_token}` } });
  }
  return res;
}

export async function status() {
  const tokens = loadTokens();
  if (!tokens) return { connected: false };
  const res = await graph(`${GRAPH}/me?$select=mail,userPrincipalName`, tokens);
  if (!res.ok) return { connected: false };
  const data = await res.json();
  return { connected: true, email: data.mail || data.userPrincipalName };
}

function kqlDate(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

function buildSearch({ from, to, attachmentsOnly }) {
  const terms = [`(${KEYWORDS.join(' OR ')})`];
  if (from) terms.push(`received>=${kqlDate(from)}`);
  if (to) terms.push(`received<=${kqlDate(to)}`);
  if (attachmentsOnly) terms.push('hasAttachments:true');
  return terms.join(' AND ');
}

export async function searchInvoices({ from, to, attachmentsOnly }) {
  const tokens = loadTokens();
  if (!tokens) return { error: 'not_connected' };

  const search = buildSearch({ from, to, attachmentsOnly });
  const select = 'id,subject,from,receivedDateTime,bodyPreview,hasAttachments,webLink,body';
  const url =
    `${GRAPH}/me/messages?$search=${encodeURIComponent(`"${search}"`)}` +
    `&$top=100&$select=${select}`;

  const res = await graph(url, tokens);
  if (!res.ok) return { error: 'search_failed', message: `graph ${res.status}` };
  const data = await res.json();
  const messages = data.value || [];

  const results = [];
  const MAX = 250;
  for (const msg of messages.slice(0, MAX)) {
    let attachments = [];
    if (msg.hasAttachments) {
      const aRes = await graph(
        `${GRAPH}/me/messages/${msg.id}/attachments?$select=id,name,contentType,size`,
        tokens
      );
      if (aRes.ok) {
        const aData = await aRes.json();
        attachments = (aData.value || [])
          .filter((a) => a['@odata.type'] === '#microsoft.graph.fileAttachment' || a.name)
          .map((a) => ({
            filename: a.name,
            mimeType: a.contentType,
            size: a.size || 0,
            attachmentId: a.id,
          }));
      }
    }
    const fromAddr = msg.from?.emailAddress
      ? `${msg.from.emailAddress.name || ''} <${msg.from.emailAddress.address || ''}>`.trim()
      : '';
    const bodyHtml = msg.body?.contentType === 'html' ? msg.body.content : '';
    const bodyText = msg.body?.contentType === 'text' ? msg.body.content : msg.bodyPreview || '';
    const bodyPlain = htmlToText(bodyHtml) || bodyText || '';
    const amount =
      parseTotalAmount(msg.subject) ||
      parseTotalAmount(bodyPlain) ||
      parseAmount(msg.subject) ||
      parseAmount(msg.bodyPreview) ||
      parseAmount(bodyPlain);
    results.push({
      id: msg.id,
      provider: id,
      subject: msg.subject || '',
      from: fromAddr,
      date: msg.receivedDateTime ? new Date(msg.receivedDateTime).toISOString() : null,
      snippet: msg.bodyPreview || '',
      amount: amount?.display || '',
      amountValue: amount?.value ?? null,
      amountCurrency: amount?.currency || '',
      attachments,
      links: extractLinks(bodyHtml, bodyText),
      emailUrl: msg.webLink || '',
    });
  }

  results.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return { query: search, count: results.length, truncated: messages.length >= MAX, results };
}

export async function getAttachment({ messageId, attachmentId }) {
  const tokens = loadTokens();
  if (!tokens) return null;
  const res = await graph(
    `${GRAPH}/me/messages/${messageId}/attachments/${attachmentId}`,
    tokens
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.contentBytes) return null;
  return {
    buffer: Buffer.from(data.contentBytes, 'base64'),
    filename: data.name,
    mimeType: data.contentType,
  };
}
