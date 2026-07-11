import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, 'token.json');
const PORT = process.env.PORT || 3000;

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`,
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error(
    '\n[config] Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.\n' +
      'Copy .env.example to .env and fill in your Google OAuth credentials.\n'
  );
}

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
  'חשבונית/קבלה',
];

function makeOAuthClient() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

function loadTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

/** Returns an authorized OAuth client, or null if the user has not connected yet. */
function authedClient() {
  const tokens = loadTokens();
  if (!tokens) return null;
  const client = makeOAuthClient();
  client.setCredentials(tokens);
  // Persist refreshed tokens automatically.
  client.on('tokens', (t) => {
    const merged = { ...loadTokens(), ...t };
    saveTokens(merged);
  });
  return client;
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// ---- Auth routes --------------------------------------------------------

app.get('/auth', (req, res) => {
  const client = makeOAuthClient();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
  res.redirect(url);
});

app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing authorization code.');
  try {
    const client = makeOAuthClient();
    const { tokens } = await client.getToken(code);
    saveTokens(tokens);
    res.redirect('/');
  } catch (err) {
    console.error('[oauth] token exchange failed:', err.message);
    res.status(500).send('Authorization failed. Check server logs.');
  }
});

app.post('/api/logout', (req, res) => {
  try {
    fs.unlinkSync(TOKEN_PATH);
  } catch {
    /* already gone */
  }
  res.json({ ok: true });
});

app.get('/api/status', async (req, res) => {
  const configured = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
  const client = authedClient();
  if (!client) return res.json({ configured, connected: false });
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();
    res.json({ configured, connected: true, email: data.email });
  } catch {
    res.json({ configured, connected: true });
  }
});

// ---- Invoice search -----------------------------------------------------

/** Gmail wants dates as YYYY/MM/DD. `before:` is exclusive, so callers add a day. */
function toGmailDate(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

function buildQuery({ from, to, attachmentsOnly }) {
  const parts = [];
  const kw = KEYWORDS.map((k) => (k.includes(' ') ? `"${k}"` : k)).join(' OR ');
  parts.push(`{${kw}}`); // Gmail treats {a b c} as OR of terms
  if (from) parts.push(`after:${toGmailDate(from)}`);
  if (to) {
    const d = new Date(to);
    d.setDate(d.getDate() + 1); // make the range inclusive of the "to" day
    parts.push(`before:${toGmailDate(d)}`);
  }
  if (attachmentsOnly) parts.push('has:attachment');
  return parts.join(' ');
}

function headerValue(headers, name) {
  const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

/** Walk the MIME tree and collect file attachments. */
function collectAttachments(payload, acc = []) {
  if (!payload) return acc;
  const { filename, body, parts, mimeType } = payload;
  if (filename && body && body.attachmentId) {
    acc.push({
      filename,
      mimeType,
      size: body.size || 0,
      attachmentId: body.attachmentId,
    });
  }
  if (parts) parts.forEach((p) => collectAttachments(p, acc));
  return acc;
}

const AMOUNT_RE =
  /(?:₪|\$|€|£|ILS|USD|EUR|NIS)\s?-?\d[\d,]*(?:\.\d{1,2})?|\d[\d,]*(?:\.\d{1,2})?\s?(?:₪|\$|€|£|ILS|USD|EUR|NIS|שקל|ש"ח)/i;

function guessAmount(text) {
  if (!text) return '';
  const m = text.match(AMOUNT_RE);
  return m ? m[0].replace(/\s+/g, ' ').trim() : '';
}

app.get('/api/invoices', async (req, res) => {
  const client = authedClient();
  if (!client) return res.status(401).json({ error: 'not_connected' });

  const gmail = google.gmail({ version: 'v1', auth: client });
  const { from, to } = req.query;
  const attachmentsOnly = req.query.attachmentsOnly === 'true';
  const q = buildQuery({ from, to, attachmentsOnly });

  try {
    // Page through message ids (cap the total so a huge inbox stays responsive).
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

    // Fetch each message's metadata. Do it in small batches to stay polite.
    const results = [];
    const BATCH = 10;
    for (let i = 0; i < limited.length; i += BATCH) {
      const chunk = limited.slice(i, i + BATCH);
      const msgs = await Promise.all(
        chunk.map((id) =>
          gmail.users.messages
            .get({ userId: 'me', id, format: 'full' })
            .then((r) => r.data)
            .catch(() => null)
        )
      );
      for (const msg of msgs) {
        if (!msg) continue;
        const headers = msg.payload?.headers || [];
        const subject = headerValue(headers, 'Subject');
        const fromHdr = headerValue(headers, 'From');
        const dateHdr = headerValue(headers, 'Date');
        const attachments = collectAttachments(msg.payload);
        const amount = guessAmount(subject) || guessAmount(msg.snippet);
        results.push({
          id: msg.id,
          threadId: msg.threadId,
          subject,
          from: fromHdr,
          date: dateHdr ? new Date(dateHdr).toISOString() : null,
          snippet: msg.snippet || '',
          amount,
          attachments,
        });
      }
    }

    results.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    res.json({ query: q, count: results.length, truncated: ids.length >= MAX, results });
  } catch (err) {
    console.error('[invoices] search failed:', err.message);
    res.status(500).json({ error: 'search_failed', message: err.message });
  }
});

// ---- Attachment download ------------------------------------------------

app.get('/api/attachment', async (req, res) => {
  const client = authedClient();
  if (!client) return res.status(401).json({ error: 'not_connected' });

  const { messageId, attachmentId, filename } = req.query;
  if (!messageId || !attachmentId) {
    return res.status(400).json({ error: 'missing_params' });
  }

  const gmail = google.gmail({ version: 'v1', auth: client });
  try {
    const { data } = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });
    const buffer = Buffer.from(data.data, 'base64url');
    const safeName = (filename || 'attachment').replace(/[^\w.\-]+/g, '_');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.send(buffer);
  } catch (err) {
    console.error('[attachment] download failed:', err.message);
    res.status(500).json({ error: 'download_failed' });
  }
});

app.listen(PORT, () => {
  console.log(`\n  Invoice Collector running at http://localhost:${PORT}\n`);
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.log('  ⚠  Set up your .env first (see .env.example).\n');
  }
});
