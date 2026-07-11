// Helpers for detecting a monetary amount inside a subject / snippet / body.

const SYMBOL_TO_CURRENCY = {
  '₪': 'ILS',
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  'ש"ח': 'ILS',
  'ש״ח': 'ILS',
  שקל: 'ILS',
  NIS: 'ILS',
  ILS: 'ILS',
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
};

// Currency-then-number, or number-then-currency. Global so we can list all matches.
const AMOUNT_RE =
  /(₪|\$|€|£|ILS|USD|EUR|GBP|NIS)\s?(-?\d[\d,]*(?:\.\d{1,2})?)|(-?\d[\d,]*(?:\.\d{1,2})?)\s?(₪|\$|€|£|ILS|USD|EUR|GBP|NIS|שקל|ש"ח|ש״ח)/gi;

// Words that typically precede the invoice total (Hebrew + English).
const TOTAL_KEYWORDS = [
  'סה"כ',
  'סה״כ',
  'סהכ',
  'סך הכל',
  'סך הכול',
  'סך לתשלום',
  'לתשלום',
  'סכום לתשלום',
  'סכום כולל',
  'לחיוב',
  'total',
  'total due',
  'amount due',
  'grand total',
  'balance due',
  'total amount',
];

function toMatch(m) {
  const symbol = (m[1] || m[4] || '').trim();
  const numRaw = m[2] || m[3] || '';
  const value = Number(numRaw.replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  const currency =
    SYMBOL_TO_CURRENCY[symbol] || SYMBOL_TO_CURRENCY[symbol.toUpperCase()] || '';
  return {
    display: m[0].replace(/\s+/g, ' ').trim(),
    value,
    currency,
    index: m.index,
  };
}

/** All monetary amounts in `text`, in order. */
export function findAmounts(text) {
  if (!text) return [];
  const out = [];
  AMOUNT_RE.lastIndex = 0;
  let m;
  while ((m = AMOUNT_RE.exec(text))) {
    const parsed = toMatch(m);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** First amount found, or null. Returns { display, value, currency }. */
export function parseAmount(text) {
  const [first] = findAmounts(text);
  return first ? { display: first.display, value: first.value, currency: first.currency } : null;
}

/**
 * Amount that appears right after a "total"-type keyword — the invoice total.
 * Scans a window of text before each amount for a keyword; picks the closest
 * match, breaking ties toward the larger value. Returns null if none found.
 */
export function parseTotalAmount(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const amounts = findAmounts(text);
  let best = null;
  let bestDist = Infinity;

  for (const a of amounts) {
    const windowStart = Math.max(0, a.index - 40);
    const before = lower.slice(windowStart, a.index);
    let closest = Infinity;
    for (const kw of TOTAL_KEYWORDS) {
      const pos = before.lastIndexOf(kw.toLowerCase());
      if (pos !== -1) closest = Math.min(closest, before.length - pos);
    }
    if (closest === Infinity) continue;
    if (closest < bestDist || (closest === bestDist && a.value > (best?.value ?? 0))) {
      best = a;
      bestDist = closest;
    }
  }
  return best ? { display: best.display, value: best.value, currency: best.currency } : null;
}

/** Strip HTML to readable text (tags removed, entities decoded, whitespace collapsed). */
export function htmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
