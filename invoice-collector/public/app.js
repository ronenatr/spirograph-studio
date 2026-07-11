'use strict';

const $ = (id) => document.getElementById(id);
let currentResults = [];

// ---- Account / connection state ----------------------------------------

async function refreshStatus() {
  let s;
  try {
    s = await fetch('/api/status').then((r) => r.json());
  } catch {
    s = { configured: false, connected: false };
  }

  const dot = $('statusDot');
  const text = $('accountText');

  if (!s.configured) {
    dot.className = 'status-dot off';
    text.textContent = 'השרת לא מוגדר (חסר .env)';
    show('connectPanel');
    hide('appPanel');
    $('connectMsg').innerHTML =
      'השרת עדיין לא הוגדר. העתק את <code>.env.example</code> ל‑<code>.env</code> ' +
      'ומלא את פרטי ה‑OAuth של Google. פרטים ב‑README.';
    $('authBtnBig').classList.add('hidden');
    $('authBtn').classList.add('hidden');
    $('logoutBtn').classList.add('hidden');
    return;
  }

  if (s.connected) {
    dot.className = 'status-dot on';
    text.textContent = s.email || 'מחובר';
    $('authBtn').classList.add('hidden');
    $('logoutBtn').classList.remove('hidden');
    hide('connectPanel');
    show('appPanel');
  } else {
    dot.className = 'status-dot off';
    text.textContent = 'לא מחובר';
    $('authBtn').classList.remove('hidden');
    $('logoutBtn').classList.add('hidden');
    $('authBtnBig').classList.remove('hidden');
    show('connectPanel');
    hide('appPanel');
  }
}

function goAuth() {
  window.location.href = '/auth';
}
async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  currentResults = [];
  renderResults([]);
  refreshStatus();
}

function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

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

  hide('resultsWrap');
  hide('emptyState');
  hide('summary');
  show('loading');
  $('searchBtn').disabled = true;
  $('exportBtn').disabled = true;

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (attachmentsOnly) params.set('attachmentsOnly', 'true');

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
    renderSummary(data);
    renderResults(currentResults);
  } catch (err) {
    alert('שגיאה בחיפוש: ' + err.message);
  } finally {
    hide('loading');
    $('searchBtn').disabled = false;
  }
}

function renderSummary(data) {
  const withAtt = currentResults.filter((r) => r.attachments.length).length;
  const el = $('summary');
  el.innerHTML = `
    <div class="stat"><b>${data.count}</b><span>נמצאו</span></div>
    <div class="stat"><b>${withAtt}</b><span>עם קובץ מצורף</span></div>
    ${data.truncated ? '<div class="stat"><b>⚠</b><span>הוצגו 250 הראשונות — צמצם טווח</span></div>' : ''}
  `;
  show('summary');
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function shortFrom(from) {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  if (m && m[1].trim()) return m[1].trim();
  const e = from.match(/<([^>]+)>/);
  return e ? e[1] : from;
}

function renderResults(rows) {
  const body = $('resultsBody');
  body.innerHTML = '';
  if (!rows.length) {
    hide('resultsWrap');
    show('emptyState');
    $('exportBtn').disabled = true;
    return;
  }
  hide('emptyState');
  for (const r of rows) {
    const tr = document.createElement('tr');
    const atts = r.attachments
      .map(
        (a) =>
          `<a class="att" href="/api/attachment?messageId=${encodeURIComponent(r.id)}&attachmentId=${encodeURIComponent(a.attachmentId)}&filename=${encodeURIComponent(a.filename)}" title="${escapeHtml(a.filename)}">📎 ${escapeHtml(a.filename)}</a>`
      )
      .join('<br>');
    tr.innerHTML = `
      <td class="col-check"><input type="checkbox" class="row-check" data-id="${r.id}"></td>
      <td>${formatDate(r.date)}</td>
      <td class="cell-from">${escapeHtml(shortFrom(r.from))}</td>
      <td class="cell-subject">${escapeHtml(r.subject) || '(ללא נושא)'}<span class="snippet">${escapeHtml(r.snippet).slice(0, 90)}</span></td>
      <td class="amount">${escapeHtml(r.amount) || ''}</td>
      <td>${atts || '<span class="muted">—</span>'}</td>
    `;
    body.appendChild(tr);
  }
  show('resultsWrap');
  $('exportBtn').disabled = false;
}

// ---- CSV export ---------------------------------------------------------

function toCsv(rows) {
  const header = ['תאריך', 'שולח', 'נושא', 'סכום', 'קבצים מצורפים'];
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [header.map(escape).join(',')];
  for (const r of rows) {
    lines.push(
      [
        formatDate(r.date),
        shortFrom(r.from),
        r.subject,
        r.amount,
        r.attachments.map((a) => a.filename).join(' | '),
      ]
        .map(escape)
        .join(',')
    );
  }
  return '﻿' + lines.join('\r\n'); // BOM so Excel reads Hebrew correctly
}

function exportCsv() {
  const selected = new Set(
    [...document.querySelectorAll('.row-check:checked')].map((c) => c.dataset.id)
  );
  const rows = selected.size
    ? currentResults.filter((r) => selected.has(r.id))
    : currentResults;
  if (!rows.length) return;
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---- Wiring -------------------------------------------------------------

$('authBtn').addEventListener('click', goAuth);
$('authBtnBig').addEventListener('click', goAuth);
$('logoutBtn').addEventListener('click', logout);
$('searchBtn').addEventListener('click', search);
$('exportBtn').addEventListener('click', exportCsv);
$('selectAll').addEventListener('change', (e) => {
  document.querySelectorAll('.row-check').forEach((c) => (c.checked = e.target.checked));
});
document.querySelectorAll('.chip').forEach((c) =>
  c.addEventListener('click', () => applyQuickRange(c.dataset.range))
);

applyQuickRange('thisYear');
refreshStatus();
