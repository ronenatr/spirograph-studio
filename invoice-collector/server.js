import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import dotenv from 'dotenv';

import * as googleProvider from './providers/google.js';
import * as microsoftProvider from './providers/microsoft.js';
import { extractPdfAmount, isPdf } from './providers/pdf.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const PROVIDERS = {
  google: googleProvider,
  microsoft: microsoftProvider,
};

function getProvider(idParam) {
  return PROVIDERS[idParam] || null;
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// ---- Auth --------------------------------------------------------------

app.get('/auth/:provider', (req, res) => {
  const p = getProvider(req.params.provider);
  if (!p) return res.status(404).send('Unknown provider.');
  if (!p.isConfigured()) return res.status(400).send(`${p.name} is not configured (.env).`);
  res.redirect(p.authUrl());
});

app.get('/oauth2callback/:provider', async (req, res) => {
  const p = getProvider(req.params.provider);
  if (!p) return res.status(404).send('Unknown provider.');
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing authorization code.');
  try {
    await p.handleCallback(code);
    res.redirect('/');
  } catch (err) {
    console.error(`[oauth:${p.id}] failed:`, err.message);
    res.status(500).send('Authorization failed. Check server logs.');
  }
});

app.post('/api/logout/:provider', (req, res) => {
  const p = getProvider(req.params.provider);
  if (!p) return res.status(404).json({ error: 'unknown_provider' });
  p.logout();
  res.json({ ok: true });
});

app.get('/api/status', async (req, res) => {
  const out = {};
  await Promise.all(
    Object.values(PROVIDERS).map(async (p) => {
      const configured = p.isConfigured();
      let connected = false;
      let email;
      if (configured) {
        try {
          const s = await p.status();
          connected = s.connected;
          email = s.email;
        } catch {
          /* leave disconnected */
        }
      }
      out[p.id] = { id: p.id, name: p.name, configured, connected, email };
    })
  );
  res.json(out);
});

// ---- Invoice search ----------------------------------------------------

app.get('/api/invoices', async (req, res) => {
  const p = getProvider(req.query.provider || 'google');
  if (!p) return res.status(404).json({ error: 'unknown_provider' });

  const { from, to } = req.query;
  const attachmentsOnly = req.query.attachmentsOnly === 'true';
  const scanPdf = req.query.scanPdf === 'true';
  try {
    const result = await p.searchInvoices({ from, to, attachmentsOnly });
    if (result.error === 'not_connected') return res.status(401).json(result);
    if (result.error) return res.status(500).json(result);
    if (scanPdf) await scanPdfsForAmounts(p, result.results);
    res.json(result);
  } catch (err) {
    console.error(`[invoices:${p.id}] failed:`, err.message);
    res.status(500).json({ error: 'search_failed', message: err.message });
  }
});

// For results with no detected amount, download the first PDF attachment and
// try to read the total from it. Bounded so a big result set stays responsive.
async function scanPdfsForAmounts(provider, results) {
  const MAX_PDF_SCANS = 25;
  const targets = results
    .filter((r) => r.amountValue == null && r.attachments.some(isPdf))
    .slice(0, MAX_PDF_SCANS);
  for (const r of targets) {
    const pdf = r.attachments.find(isPdf);
    try {
      const att = await provider.getAttachment({ messageId: r.id, attachmentId: pdf.attachmentId });
      if (!att?.buffer) continue;
      const amount = await extractPdfAmount(att.buffer);
      if (amount) {
        r.amount = amount.display;
        r.amountValue = amount.value;
        r.amountCurrency = amount.currency;
        r.amountSource = 'pdf';
      }
    } catch {
      /* skip this one */
    }
  }
}

// ---- Attachment (download or inline preview) ---------------------------

app.get('/api/attachment', async (req, res) => {
  const p = getProvider(req.query.provider || 'google');
  if (!p) return res.status(404).json({ error: 'unknown_provider' });

  const { messageId, attachmentId, filename, mimeType } = req.query;
  const inline = req.query.disposition === 'inline';
  if (!messageId || !attachmentId) return res.status(400).json({ error: 'missing_params' });

  try {
    const att = await p.getAttachment({ messageId, attachmentId });
    if (!att) return res.status(404).json({ error: 'not_found' });
    const safeName = (att.filename || filename || 'attachment').replace(/[^\w.\-]+/g, '_');
    const type = att.mimeType || mimeType || 'application/octet-stream';
    res.setHeader('Content-Type', type);
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`
    );
    res.send(att.buffer);
  } catch (err) {
    console.error(`[attachment:${p.id}] failed:`, err.message);
    res.status(500).json({ error: 'download_failed' });
  }
});

app.listen(PORT, () => {
  console.log(`\n  Invoice Collector running at http://localhost:${PORT}\n`);
  const missing = Object.values(PROVIDERS).filter((p) => !p.isConfigured());
  if (missing.length) {
    console.log(`  ⚠  Not configured: ${missing.map((p) => p.name).join(', ')} (see .env.example)\n`);
  }
});
