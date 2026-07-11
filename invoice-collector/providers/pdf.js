import { createRequire } from 'node:module';
import { parseTotalAmount, parseAmount } from './amount.js';

// pdf-parse is CommonJS; import the inner lib directly to skip the package's
// top-level "debug mode" block that reads a bundled test PDF on import.
const require = createRequire(import.meta.url);
let pdfParse;
try {
  pdfParse = require('pdf-parse/lib/pdf-parse.js');
} catch {
  pdfParse = null;
}

/**
 * Extract an invoice total from a PDF buffer.
 * Returns { display, value, currency } or null (bad/missing/scanned PDF).
 */
export async function extractPdfAmount(buffer) {
  if (!pdfParse || !buffer) return null;
  try {
    const data = await pdfParse(buffer);
    const text = data.text || '';
    return parseTotalAmount(text) || parseAmount(text);
  } catch {
    return null; // encrypted, malformed, or image-only PDF
  }
}

export function isPdf(attachment) {
  const t = (attachment.mimeType || '').toLowerCase();
  const n = (attachment.filename || '').toLowerCase();
  return t.includes('pdf') || n.endsWith('.pdf');
}
