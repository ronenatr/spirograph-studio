// Shared helpers for detecting a monetary amount inside a subject / snippet.

const SYMBOL_TO_CURRENCY = {
  '₪': 'ILS',
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  'ש"ח': 'ILS',
  שקל: 'ILS',
  NIS: 'ILS',
  ILS: 'ILS',
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
};

// Currency-then-number, or number-then-currency.
const AMOUNT_RE =
  /(₪|\$|€|£|ILS|USD|EUR|GBP|NIS)\s?(-?\d[\d,]*(?:\.\d{1,2})?)|(-?\d[\d,]*(?:\.\d{1,2})?)\s?(₪|\$|€|£|ILS|USD|EUR|GBP|NIS|שקל|ש"ח)/i;

/**
 * Returns { display, value, currency } or null.
 * value is a Number (dot decimal, no thousands separators); currency is a code.
 */
export function parseAmount(text) {
  if (!text) return null;
  const m = text.match(AMOUNT_RE);
  if (!m) return null;

  const symbol = (m[1] || m[4] || '').trim();
  const numRaw = m[2] || m[3] || '';
  const value = Number(numRaw.replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;

  const currency = SYMBOL_TO_CURRENCY[symbol] || SYMBOL_TO_CURRENCY[symbol.toUpperCase()] || '';
  return {
    display: m[0].replace(/\s+/g, ' ').trim(),
    value,
    currency,
  };
}
