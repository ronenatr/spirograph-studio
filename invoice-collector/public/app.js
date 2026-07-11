'use strict';

const $ = (id) => document.getElementById(id);
let currentResults = [];
let activeProvider = 'google';
let statusCache = {};
let newIds = new Set(); // ids new since the previous search for this provider

// ---- "New since last visit" tracking (localStorage) --------------------

function seenKey() {
  return `seen:${activeProvider}`;
}
function loadSeen() {
  const raw = localStorage.getItem(seenKey());
  return raw ? new Set(JSON.parse(raw)) : null; // null = never searched before
}
function saveSeen(set) {
  localStorage.setItem(seenKey(), JSON.stringify([...set]));
}
function markAllSeen() {
  const seen = loadSeen() || new Set();
  currentResults.forEach((r) => seen.add(r.id));
  saveSeen(seen);
  newIds = new Set();
  renderResults(currentResults);
  renderSummaryCount();
}

function detectNewInvoices() {
  const seen = loadSeen();
  if (seen === null) {
    // First ever search for this provider — establish a baseline silently.
    saveSeen(new Set(currentResults.map((r) => r.id)));
    newIds = new Set();
    return;
  }
  newIds = new Set(currentResults.filter((r) => !seen.has(r.id)).map((r) => r.id));
  if (newIds.size && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('אספן חשבוניות', {
        body: `${newIds.size} חשבוניות/קבלות חדשות מאז הביקור הקודם`,
      });
    } catch {
      /* notifications unavailable */
    }
  }
}

function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

// ---- Account / connection state ----------------------------------------

async function refreshStatus() {
  try {
    statusCache = await fetch('/api/status').then((r) => r.json());
  } catch {
    statusCache = {};
  }

  // Per-provider dots on the switch.
  for (const pid of ['google', 'microsoft']) {
    const dot = $(`dot-${pid}`);
    const s = statusCache[pid] || {};
    dot.className = 'prov-dot ' + (s.connected ? 'on' : s.configured ? 'off' : 'na');
    dot.title = s.connected ? (s.email || 'מחובר') : s.configured ? 'לא מחובר' : 'לא מוגדר';
  }
  document.querySelectorAll('.prov').forEach((b) =>
    b.classList.toggle('active', b.dataset.provider === activeProvider)
  );

  renderActiveProvider();
}

function renderActiveProvider() {
  const s = statusCache[activeProvider] || {};
  const dot = $('statusDot');
  const text = $('accountText');
  const name = s.name || (activeProvider === 'google' ? 'Gmail' : 'Outlook');

  if (!s.configured) {
    dot.className = 'status-dot off';
    text.textContent = `${name} לא מוגדר`;
    $('authBtn').classList.add('hidden');
    $('logoutBtn').classList.add('hidden');
    $('connectTitle').textContent = `${name} — לא מוגדר`;
    $('connectMsg').innerHTML =
      `השרת עדיין לא הוגדר עבור ${name}. הוסף את פרטי ה‑OAuth ל‑<code>.env</code> (ראה README), והפעל מחדש.`;
    $('authBtnBig').classList.add('hidden');
    show('connectPanel');
    hide('appPanel');
    return;
  }

  if (s.connected) {
    dot.className = 'status-dot on';
    text.textContent = s.email || `מחובר (${name})`;
    $('authBtn').classList.add('hidden');
    $('logoutBtn').classList.remove('hidden');
    hide('connectPanel');
    show('appPanel');
  } else {
    dot.className = 'status-dot off';
    text.textContent = `לא מחובר (${name})`;
    $('authBtn').textContent = `התחבר ל‑${name}`;
    $('authBtn').classList.remove('hidden');
    $('logoutBtn').classList.add('hidden');
    $('connectTitle').textContent = `התחברות ל‑${name}`;
    $('connectMsg').innerHTML =
      `כדי לאסוף חשבוניות וקבלות, התחבר לחשבון ה‑${name} שלך. הרשאת <strong>קריאה בלבד</strong> — לא נשלח ולא נמחק דבר.`;
    $('authBtnBig').textContent = `התחבר ל‑${name}`;
    $('authBtnBig').classList.remove('hidden');
    show('connectPanel');
    hide('appPanel');
  }
}

function goAuth() {
  window.location.href = `/auth/${activeProvider}`;
}
async function logout() {
  await fetch(`/api/logout/${activeProvider}`, { method: 'POST' });
  currentResults = [];
  renderResults([]);
  hide('summary');
  hide('totals');
  refreshStatus();
}

function switchProvider(pid) {
  if (pid === activeProvider) return;
  activeProvider = pid;
  currentResults = [];
  renderResults([]);
  hide('summary');
  hide('totals');
  refreshStatus();
}

// ---- Date range helpers -------------------------------------------------

function fmt(d) {
  return d.toISOString().slice(0, 10);
}
function applyQuickRange(kind) {
  const now = new Date();
  let from, to;
  switch (kind) {
    case 'thisMonth':
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = now;
      break;
    case 'lastMonth':
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case 'thisYear':
      from = new Date(now.getFullYear(), 0, 1);
      to = now;
      break;
    case 'lastYear':
      from = new Date(now.getFullYear() - 1, 0, 1);
      to = new Date(now.getFullYear() - 1, 11, 31);
      break;
    case 'all':
      $('from').value = '';
      $('to').value = '';
      return;
  }
  $('from').value = fmt(from);
  $('to').value = fmt(to);
}

// ---- Search -------------------------------------------------------------

async function search() {
  const from = $('from').value;
  const to = $('to').value;
  const attachmentsOnly = $('attachmentsOnly').checked;

  // Ask for notification permission on this user gesture (first search).
  if ('Notification' in window && Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch { /* older browsers */ }
  }

  hide('resultsWrap');
  hide('emptyState');
  hide('summary');
  hide('totals');
  show('loading');
  $('searchBtn').disabled = true;
  $('exportBtn').disabled = true;
  $('markSeenBtn').disabled = true;

  const params = new URLSearchParams({ provider: activeProvider });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (attachmentsOnly) params.set('attachmentsOnly', 'true');
  if ($('scanPdf').checked) params.set('scanPdf', 'true');

  try {
    const res = await fetch('/api/invoices?' + params.toString());
    if (res.status === 401) {
      refreshStatus();
      return;
    }
    const data = await res.json();
    if (data.error) {
      alert('החיפוש נכשל: ' + (data.message || data.error));
      return;
    }
    currentResults = data.results || [];
    detectNewInvoices();
    lastData = data;
    renderSummary(data);
    renderTotals(currentResults);
    renderResults(currentResults);
  } catch (err) {
    alert('שגיאה בחיפוש: ' + err.message);
  } finally {
    hide('loading');
    $('searchBtn').disabled = false;
  }
}

let lastData = null;

function renderSummary(data) {
  lastData = data;
  const withAtt = currentResults.filter((r) => r.attachments.length).length;
  const newStat = newIds.size
    ? `<div class="stat new"><b>${newIds.size}</b><span>חדשות ✨</span></div>`
    : '';
  const pdfStat = currentResults.some((r) => r.amountSource === 'pdf')
    ? `<div class="stat"><b>${currentResults.filter((r) => r.amountSource === 'pdf').length}</b><span>סכום מ‑PDF</span></div>`
    : '';
  $('summary').innerHTML = `
    <div class="stat"><b>${data.count}</b><span>נמצאו</span></div>
    ${newStat}
    <div class="stat"><b>${withAtt}</b><span>עם קובץ מצורף</span></div>
    ${pdfStat}
    ${data.truncated ? '<div class="stat"><b>⚠</b><span>הוצגו 250 הראשונות — צמצם טווח</span></div>' : ''}
  `;
  show('summary');
}

function renderSummaryCount() {
  if (lastData) renderSummary(lastData);
}

// ---- Monthly totals -----------------------------------------------------

const CURRENCY_SIGN = { ILS: '₪', USD: '$', EUR: '€', GBP: '£' };
function money(value, currency) {
  const sign = CURRENCY_SIGN[currency] || (currency ? currency + ' ' : '');
  return sign + value.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderTotals(rows) {
  const priced = rows.filter((r) => typeof r.amountValue === 'number' && r.amountValue > 0);
  if (!priced.length) {
    hide('totals');
    return;
  }

  // Grand totals per currency.
  const byCurrency = {};
  // Per month, per currency.
  const byMonth = {};
  for (const r of priced) {
    const cur = r.amountCurrency || '?';
    byCurrency[cur] = (byCurrency[cur] || 0) + r.amountValue;
    const month = (r.date || '').slice(0, 7) || 'לא ידוע';
    byMonth[month] ??= {};
    byMonth[month][cur] = (byMonth[month][cur] || 0) + r.amountValue;
  }

  const grand = Object.entries(byCurrency)
    .map(([cur, v]) => `<span class="pill">${money(v, cur === '?' ? '' : cur)}</span>`)
    .join('');

  const months = Object.keys(byMonth).sort().reverse();
  const monthRows = months
    .map((m) => {
      const sums = Object.entries(byMonth[m])
        .map(([cur, v]) => money(v, cur === '?' ? '' : cur))
        .join(' · ');
      return `<tr><td>${m}</td><td>${sums}</td></tr>`;
    })
    .join('');

  // Per-vendor (sender) breakdown, top 6 by total.
  const byVendor = {};
  for (const r of priced) {
    const v = shortFrom(r.from) || '—';
    byVendor[v] ??= { total: 0, cur: {} };
    byVendor[v].total += r.amountValue;
    const c = r.amountCurrency || '?';
    byVendor[v].cur[c] = (byVendor[v].cur[c] || 0) + r.amountValue;
  }
  const vendorRows = Object.entries(byVendor)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 6)
    .map(([v, info]) => {
      const sums = Object.entries(info.cur)
        .map(([cur, val]) => money(val, cur === '?' ? '' : cur))
        .join(' · ');
      return `<tr><td>${escapeHtml(v)}</td><td>${sums}</td></tr>`;
    })
    .join('');

  $('totals').innerHTML = `
    <div class="totals-head">
      <b>סה״כ מזוהה:</b> ${grand}
      <span class="muted">(${priced.length} מתוך ${rows.length} עם סכום מזוהה)</span>
    </div>
    <div class="totals-grid">
      <div>
        <div class="totals-subhead">לפי חודש</div>
        <table class="month-table">
          <thead><tr><th>חודש</th><th>סכום</th></tr></thead>
          <tbody>${monthRows}</tbody>
        </table>
      </div>
      <div>
        <div class="totals-subhead">לפי ספק</div>
        <table class="month-table">
          <thead><tr><th>ספק</th><th>סכום</th></tr></thead>
          <tbody>${vendorRows}</tbody>
        </table>
      </div>
    </div>
  `;
  show('totals');
}

// ---- Results table ------------------------------------------------------

function escapeHtml(s) {
  return (s || '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );
}
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
function shortFrom(from) {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  if (m && m[1].trim()) return m[1].trim();
  const e = from.match(/<([^>]+)>/);
  return e ? e[1] : from;
}

function attUrl(r, a, disposition) {
  const p = new URLSearchParams({
    provider: r.provider || activeProvider,
    messageId: r.id,
    attachmentId: a.attachmentId,
    filename: a.filename || 'attachment',
    mimeType: a.mimeType || '',
  });
  if (disposition) p.set('disposition', disposition);
  return '/api/attachment?' + p.toString();
}

function isPreviewable(a) {
  const t = (a.mimeType || '').toLowerCase();
  const n = (a.filename || '').toLowerCase();
  return t.includes('pdf') || t.startsWith('image/') || n.endsWith('.pdf') ||
    /\.(png|jpe?g|gif|webp)$/.test(n);
}

function renderResults(rows) {
  const body = $('resultsBody');
  body.innerHTML = '';
  if (!rows.length) {
    hide('resultsWrap');
    $('exportBtn').disabled = true;
    return;
  }
  for (const r of rows) {
    const tr = document.createElement('tr');
    const atts = r.attachments
      .map((a, i) => {
        const preview = isPreviewable(a)
          ? `<button class="att preview" data-r="${escapeHtml(r.id)}" data-i="${i}" title="תצוגה מקדימה">👁</button>`
          : '';
        return `<span class="att-row">${preview}<a class="att" href="${attUrl(r, a)}" title="${escapeHtml(a.filename)}">📎 ${escapeHtml(a.filename)}</a></span>`;
      })
      .join('');
    const bodyLinks = (r.links || [])
      .map(
        (l) =>
          `<a class="att link" href="${escapeHtml(l.url)}" target="_blank" rel="noopener" title="${escapeHtml(l.url)}">🔗 ${escapeHtml(l.label)}</a>`
      )
      .join('');
    const mailLink = r.emailUrl
      ? `<a class="att mail" href="${escapeHtml(r.emailUrl)}" target="_blank" rel="noopener" title="פתח את המייל המקורי">✉ פתח במייל</a>`
      : '';
    const filesCell = [atts, bodyLinks].filter(Boolean).join('') || '';
    const badge = newIds.has(r.id) ? '<span class="new-badge">חדש</span> ' : '';
    if (newIds.has(r.id)) tr.classList.add('row-new');
    tr.innerHTML = `
      <td class="col-check"><input type="checkbox" class="row-check" data-id="${escapeHtml(r.id)}"></td>
      <td>${formatDate(r.date)}</td>
      <td class="cell-from">${escapeHtml(shortFrom(r.from))}</td>
      <td class="cell-subject">${badge}${escapeHtml(r.subject) || '(ללא נושא)'}<span class="snippet">${escapeHtml(r.snippet).slice(0, 90)}</span></td>
      <td class="amount">${escapeHtml(r.amount) || ''}</td>
      <td class="cell-files">${filesCell}${filesCell ? '' : '<span class="muted">—</span>'}<div class="mail-line">${mailLink}</div></td>
    `;
    body.appendChild(tr);
  }
  // Wire preview buttons.
  body.querySelectorAll('.att.preview').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = currentResults.find((x) => x.id === btn.dataset.r);
      if (r) openPreview(r, r.attachments[+btn.dataset.i]);
    });
  });
  show('resultsWrap');
  $('exportBtn').disabled = false;
  $('markSeenBtn').disabled = newIds.size === 0;
}

// ---- Preview modal ------------------------------------------------------

function openPreview(r, a) {
  const inlineUrl = attUrl(r, a, 'inline');
  $('previewName').textContent = a.filename || 'קובץ';
  $('previewDownload').href = attUrl(r, a);
  const t = (a.mimeType || '').toLowerCase();
  const n = (a.filename || '').toLowerCase();
  const isImage = t.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/.test(n);
  $('previewBody').innerHTML = isImage
    ? `<img src="${inlineUrl}" alt="${escapeHtml(a.filename)}">`
    : `<iframe src="${inlineUrl}" title="${escapeHtml(a.filename)}"></iframe>`;
  show('previewOverlay');
}
function closePreview() {
  hide('previewOverlay');
  $('previewBody').innerHTML = '';
}

// ---- CSV export ---------------------------------------------------------

function toCsv(rows) {
  const header = ['ספק', 'תאריך', 'שולח', 'נושא', 'סכום', 'מטבע', 'קבצים מצורפים', 'קישורים', 'קישור למייל'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [header.map(esc).join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.provider === 'microsoft' ? 'Outlook' : 'Gmail',
        formatDate(r.date),
        shortFrom(r.from),
        r.subject,
        r.amountValue ?? r.amount,
        r.amountCurrency,
        r.attachments.map((a) => a.filename).join(' | '),
        (r.links || []).map((l) => l.url).join(' | '),
        r.emailUrl || '',
      ]
        .map(esc)
        .join(',')
    );
  }
  return '﻿' + lines.join('\r\n'); // BOM so Excel reads Hebrew correctly
}

function exportCsv() {
  const selected = new Set(
    [...document.querySelectorAll('.row-check:checked')].map((c) => c.dataset.id)
  );
  const rows = selected.size ? currentResults.filter((r) => selected.has(r.id)) : currentResults;
  if (!rows.length) return;
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `invoices-${activeProvider}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---- Wiring -------------------------------------------------------------

$('authBtn').addEventListener('click', goAuth);
$('authBtnBig').addEventListener('click', goAuth);
$('logoutBtn').addEventListener('click', logout);
$('searchBtn').addEventListener('click', search);
$('exportBtn').addEventListener('click', exportCsv);
$('markSeenBtn').addEventListener('click', markAllSeen);
$('previewClose').addEventListener('click', closePreview);
$('previewOverlay').addEventListener('click', (e) => {
  if (e.target === $('previewOverlay')) closePreview();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePreview();
});
$('selectAll').addEventListener('change', (e) => {
  document.querySelectorAll('.row-check').forEach((c) => (c.checked = e.target.checked));
});
document.querySelectorAll('.chip').forEach((c) =>
  c.addEventListener('click', () => applyQuickRange(c.dataset.range))
);
document.querySelectorAll('.prov').forEach((b) =>
  b.addEventListener('click', () => switchProvider(b.dataset.provider))
);

applyQuickRange('thisYear');
refreshStatus();
