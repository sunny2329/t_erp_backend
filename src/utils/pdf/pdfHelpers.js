const axios = require('axios');
const { jsPDF } = require('jspdf');

// A4 in mm — every generator in this app uses the same page geometry so
// header/footer/pagination code can be shared instead of copy-pasted per
// document type (unlike the reference Loadx-Youngs project, where each
// generator hand-rolled its own layout constants).
const PAGE = { width: 210, height: 297, margin: 12 };
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

function newDoc() {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'normal');
  return doc;
}

function toBuffer(doc) {
  return Buffer.from(doc.output('arraybuffer'));
}

// Starts a new page and resets y back to the top margin whenever the next
// block of `needed` mm wouldn't fit — every generator calls this before
// drawing a stop/section/row so nothing gets cut off across a page break.
function ensureSpace(doc, y, needed) {
  if (y + needed > PAGE.height - PAGE.margin - 8) {
    doc.addPage();
    return PAGE.margin;
  }
  return y;
}

// Dark section banner (stop headers, table headers) — the one repeated
// visual motif across all three PDF types.
function drawBanner(doc, x, y, width, text, { height = 6, fillColor = [51, 65, 85], textColor = [255, 255, 255] } = {}) {
  doc.setFillColor(...fillColor);
  doc.rect(x, y, width, height, 'F');
  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(text, x + 2, y + height - 1.8);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  return y + height;
}

function label(doc, text, x, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  doc.text(text.toUpperCase(), x, y);
  doc.setTextColor(0, 0, 0);
}

function value(doc, text, x, y, opts = {}) {
  doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
  doc.setFontSize(opts.size || 9);
  doc.text(text || '—', x, y, opts.maxWidth ? { maxWidth: opts.maxWidth } : undefined);
}

// Label above value, stacked — the standard "field" unit used throughout.
function field(doc, text, labelText, x, y) {
  label(doc, labelText, x, y);
  value(doc, text, x, y + 4);
  return y + 4;
}

// Postgres numeric columns come back through `pg` as strings like "38000.00"
// — strip the trailing zeros for display (weight/qty fields, not currency).
function formatNumber(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(v);
}

function formatMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(v) {
  if (!v) return '—';
  const s = String(v);
  const datePart = s.includes('T') ? s.slice(0, 10) : s.slice(0, 10);
  const d = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(d.getTime())) return datePart;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
}

function formatDateTime(v) {
  if (!v) return '—';
  const s = String(v).replace(' ', 'T');
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(v);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

function addressLine(loc) {
  if (!loc) return '—';
  const parts = [loc.address_line1, loc.city_name, loc.state_name].filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

// Best-effort logo embed — carriers.logo_url is a plain HTTP URL. Any
// failure (missing logo, network error, unsupported format) falls back to
// rendering the carrier name as text instead, never blocks PDF generation.
async function fetchLogoBase64(url) {
  if (!url) return null;
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
    const contentType = res.headers['content-type'] || '';
    const format = contentType.includes('png') ? 'PNG' : contentType.includes('jpeg') || contentType.includes('jpg') ? 'JPEG' : null;
    if (!format) return null;
    return { data: `data:${contentType};base64,${Buffer.from(res.data).toString('base64')}`, format };
  } catch (_) {
    return null;
  }
}

// Per-page footer, applied once after all content is drawn (jsPDF requires
// iterating every already-created page to stamp footers retroactively).
function stampFooters(doc, { loadNumber, carrierName }) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`Page ${i} of ${pageCount}  ·  Load # ${loadNumber || ''}  ·  ${carrierName || ''}`, PAGE.margin, PAGE.height - 6);
    doc.setTextColor(0, 0, 0);
  }
}

module.exports = {
  PAGE,
  CONTENT_WIDTH,
  newDoc,
  toBuffer,
  ensureSpace,
  drawBanner,
  label,
  value,
  field,
  formatNumber,
  formatMoney,
  formatDate,
  formatDateTime,
  addressLine,
  fetchLogoBase64,
  stampFooters,
};
