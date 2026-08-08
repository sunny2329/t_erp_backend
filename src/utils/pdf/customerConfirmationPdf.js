const {
  PAGE, CONTENT_WIDTH, newDoc, toBuffer, ensureSpace, drawBanner, field, value,
  formatNumber, formatMoney, formatDate, formatDateTime, addressLine, fetchLogoBase64, stampFooters
} = require('./pdfHelpers');

const STOP_TYPE_LABELS = { 1: 'Pickup', 2: 'Delivery' };

// data: { carrier, customer, load, stops: [{ ...load_stops row, location }] }
async function generateCustomerConfirmationPDF(data) {
  const { carrier, customer, load, stops } = data;
  const doc = newDoc();
  let y = PAGE.margin;

  // --- Header: logo / carrier name left, title right ---
  const logo = await fetchLogoBase64(carrier?.logo_url);
  if (logo) {
    try { doc.addImage(logo.data, logo.format, PAGE.margin, y, 28, 14); } catch (_) { /* fall through to text */ }
  }
  if (!logo) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(carrier?.carrier_name || 'Carrier', PAGE.margin, y + 8);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('CUSTOMER CONFIRMATION', PAGE.width - PAGE.margin, y + 8, { align: 'right' });
  y += 18;

  doc.setDrawColor(200, 200, 200);
  doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
  y += 6;

  // --- Two-column block: Customer / Carrier details (left) + Load Info (right) ---
  const colWidth = CONTENT_WIDTH / 2 - 3;
  const leftX = PAGE.margin;
  const rightX = PAGE.margin + colWidth + 6;
  let leftY = y;
  let rightY = y;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('CUSTOMER', leftX, leftY);
  leftY += 5;
  leftY = field(doc, customer?.name, 'Customer', leftX, leftY) + 5;
  leftY = field(doc, addressLine(customer), 'Address', leftX, leftY) + 5;
  leftY = field(doc, customer?.phone_no ? String(customer.phone_no) : '', 'Phone', leftX, leftY) + 5;
  leftY = field(doc, customer?.email, 'Email', leftX, leftY) + 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('CARRIER', leftX, leftY);
  leftY += 5;
  leftY = field(doc, carrier?.carrier_name, 'Carrier', leftX, leftY) + 5;
  leftY = field(doc, carrier?.mc_number, 'MC#', leftX, leftY) + 5;
  leftY = field(doc, carrier?.dot_number, 'DOT#', leftX, leftY) + 5;

  doc.setDrawColor(180, 180, 180);
  doc.rect(rightX, rightY, colWidth, 58);
  rightY += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('LOAD INFO', rightX + 2, rightY);
  rightY += 5;
  const primaryFee = Number(load.primary_fee) || 0;
  const fuelSurcharge = Number(load.fuel_surcharge) || 0;
  const rows = [
    ['Load #', load.load_number || ''],
    ['Load Date', formatDate(load.load_dt)],
    ['Primary Fee', formatMoney(primaryFee)],
    ['Fuel Surcharge', formatMoney(fuelSurcharge)],
    ['Total Fee', formatMoney(primaryFee + fuelSurcharge)],
    ['Weight', load.weight ? `${formatNumber(load.weight)} lbs` : '—'],
    ['Commodity', load.commodity || '—'],
    ['Distance', load.tendered_miles ? `${load.tendered_miles} mi` : '—'],
    ['Declared Value', load.declared_value ? formatMoney(load.declared_value) : '—'],
    ['Tarp Required', load.is_tarp_required ? 'Yes' : 'No'],
  ];
  for (const [k, v] of rows) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(k, rightX + 2, rightY);
    doc.setFont('helvetica', 'bold');
    doc.text(String(v), rightX + colWidth - 2, rightY, { align: 'right' });
    rightY += 4.6;
  }

  y = Math.max(leftY, rightY) + 6;

  // --- Stops ---
  for (const [i, stop] of stops.entries()) {
    y = ensureSpace(doc, y, 34);
    const label = `Stop # ${i + 1} (${STOP_TYPE_LABELS[stop.stop_type_id] || 'Stop'})`;
    y = drawBanner(doc, PAGE.margin, y, CONTENT_WIDTH, label);
    doc.setDrawColor(200, 200, 200);
    const boxTop = y;
    const boxHeight = 24;
    doc.rect(PAGE.margin, boxTop, CONTENT_WIDTH, boxHeight);

    const loc = stop.location || {};
    const colA = PAGE.margin + 3;
    const colB = PAGE.margin + CONTENT_WIDTH / 2 + 3;
    let ay = boxTop + 5;
    value(doc, `${formatDateTime(stop.start_dt)} — ${formatDateTime(stop.end_dt)}`, colA, ay, { size: 8, bold: true });
    ay += 5;
    value(doc, loc.location_name || '—', colA, ay, { size: 8 });
    ay += 4.5;
    value(doc, addressLine(loc), colA, ay, { size: 7.5, maxWidth: CONTENT_WIDTH / 2 - 6 });
    ay += 4.5;
    value(doc, `Phone: ${loc.phone || '—'}`, colA, ay, { size: 7.5 });

    let by = boxTop + 5;
    value(doc, `Appt Required: ${stop.is_appt_required ? 'Yes' : 'No'}`, colB, by, { size: 7.5 });
    by += 4.5;
    value(doc, `Pickup #: ${stop.pickup_number || '—'}`, colB, by, { size: 7.5 });
    by += 4.5;
    value(doc, `BOL #: ${stop.shipment_bol_number || '—'} · PO #: ${stop.po_number || '—'}`, colB, by, { size: 7.5 });
    by += 4.5;
    value(doc, `Qty: ${formatNumber(stop.total_qty)}  Weight: ${formatNumber(stop.total_weight)}`, colB, by, { size: 7.5 });

    y = boxTop + boxHeight + 6;
  }

  // --- Signature ---
  y = ensureSpace(doc, y, 20);
  y += 8;
  doc.setDrawColor(120, 120, 120);
  doc.line(PAGE.margin, y, PAGE.margin + 70, y);
  doc.setFontSize(8);
  doc.text('Authorized Signature', PAGE.margin, y + 4);
  doc.line(PAGE.margin + 90, y, PAGE.margin + 130, y);
  doc.text('Date', PAGE.margin + 90, y + 4);

  stampFooters(doc, { loadNumber: load.load_number, carrierName: carrier?.carrier_name });
  return toBuffer(doc);
}

module.exports = { generateCustomerConfirmationPDF };
