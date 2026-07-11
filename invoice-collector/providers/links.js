// Extract likely invoice/receipt links from an email body (HTML or plain text).

const INCLUDE_RE =
  /(invoice|receipt|download|statement|billing|חשבונית|קבלה|הורד|לצפייה|צפייה|צפ\b|למסמך|מסמך|document|view)/i;
const EXCLUDE_RE =
  /(unsubscribe|הסרה|preferences|manage|mailto:|tel:|\.(png|jpe?g|gif|svg|css|js)(\?|$))/i;
const PDF_RE = /\.pdf(\?|$)/i;

function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * @param {string} html  HTML body (may be empty)
 * @param {string} text  plain-text body (may be empty)
 * @returns {{url:string,label:string}[]}  de-duplicated, capped list
 */
export function extractLinks(html = '', text = '') {
  const found = new Map(); // url -> label

  // Anchor tags from HTML.
  const anchorRe = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(html))) {
    const url = decodeEntities(m[1]).trim();
    const label = decodeEntities(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    consider(found, url, label);
  }

  // Bare URLs from plain text (for text-only emails).
  const urlRe = /https?:\/\/[^\s<>"')]+/gi;
  const src = html ? '' : text; // avoid double-counting when HTML exists
  while ((m = urlRe.exec(src))) {
    consider(found, m[0].trim(), '');
  }

  return [...found.entries()].slice(0, 6).map(([url, label]) => ({
    url,
    label: label || 'קישור לחשבונית',
  }));
}

function consider(map, url, label) {
  if (!url || !/^https?:\/\//i.test(url)) return;
  if (EXCLUDE_RE.test(url) || EXCLUDE_RE.test(label)) return;
  const relevant = PDF_RE.test(url) || INCLUDE_RE.test(url) || INCLUDE_RE.test(label);
  if (!relevant) return;
  if (!map.has(url)) map.set(url, label.slice(0, 48));
}
