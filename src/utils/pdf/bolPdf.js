const {
  PAGE, CONTENT_WIDTH, newDoc, toBuffer, ensureSpace, drawBanner, field, value,
  formatNumber, formatDate, formatDateTime, addressLine, fetchLogoBase64, stampFooters
} = require('./pdfHelpers');

const STOP_TYPE_LABELS = { 1: 'Pickup', 2: 'Delivery' };

// data: { carrier, load, stops, salesAgentName }
async function generateBOLPDF(data) {
  const { carrier, load, stops, salesAgentName } = data;
  const doc = newDoc();
  let y = PAGE.margin;

  const logo = await fetchLogoBase64(carrier?.logo_url);
  if (logo) {
    try { doc.addImage(logo.data, logo.format, PAGE.margin, y, 28, 14); } catch (_) { /* fall through */ }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(carrier?.carrier_name || 'Carrier', PAGE.margin, y + 8);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('BILL OF LADING', PAGE.width - PAGE.margin, y + 6, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Load # ${load.load_number || ''}  ·  ${formatDate(load.load_dt)}`, PAGE.width - PAGE.margin, y + 11, { align: 'right' });
  y += 18;

  doc.setDrawColor(200, 200, 200);
  doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
  y += 6;

  const colWidth = CONTENT_WIDTH / 2 - 3;
  let leftY = y;
  let rightY = y;
  leftY = field(doc, carrier?.carrier_name, 'Carrier', PAGE.margin, leftY) + 5;
  leftY = field(doc, carrier?.remit_address || carrier?.bill_to_address || '', 'Address', PAGE.margin, leftY) + 5;
  leftY = field(doc, salesAgentName || '', 'Sales Agent', PAGE.margin, leftY) + 5;

  const origin = stops[0]?.location;
  const destination = stops[stops.length - 1]?.location;
  const originLabel = origin ? `${origin.city_name || ''}, ${origin.state_name || ''}` : '—';
  const destLabel = destination ? `${destination.city_name || ''}, ${destination.state_name || ''}` : '—';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('ROUTE', PAGE.margin + colWidth + 6, rightY);
  rightY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  // jsPDF's default helvetica font has no glyph for U+2192 (→) — spelling
  // out "to" avoids the garbled-character rendering that produces.
  doc.text(`${originLabel}  to  ${destLabel}`, PAGE.margin + colWidth + 6, rightY + 4, { maxWidth: colWidth });
  rightY += 10;
  rightY = field(doc, load.tendered_miles ? `${load.tendered_miles} mi` : '—', 'Distance', PAGE.margin + colWidth + 6, rightY) + 5;

  y = Math.max(leftY, rightY) + 6;

  // --- Stops ---
  for (const [i, stop] of stops.entries()) {
    y = ensureSpace(doc, y, 32);
    const label = `Stop # ${i + 1} (${STOP_TYPE_LABELS[stop.stop_type_id] || 'Stop'})`;
    y = drawBanner(doc, PAGE.margin, y, CONTENT_WIDTH, label);
    const boxT = y;
    const boxHeight = 26;
    doc.setDrawColor(200, 200, 200);
    doc.rect(PAGE.margin, boxT, CONTENT_WIDTH, boxHeight);
    const loc = stop.location || {};
    const colA = PAGE.margin + 3;
    const colB = PAGE.margin + CONTENT_WIDTH / 2 + 3;
    let ay = boxT + 5;
    value(doc, `Window: ${formatDateTime(stop.start_dt)} — ${formatDateTime(stop.end_dt)}`, colA, ay, { size: 8, bold: true });
    ay += 5;
    value(doc, loc.location_name || '—', colA, ay, { size: 8 });
    ay += 4.5;
    value(doc, addressLine(loc), colA, ay, { size: 7.5, maxWidth: CONTENT_WIDTH / 2 - 6 });
    ay += 4.5;
    value(doc, `Phone: ${loc.phone || '—'}  Fax: ${loc.fax || '—'}`, colA, ay, { size: 7.5 });
    ay += 4.5;
    value(doc, stop.location_notes || '', colA, ay, { size: 7, maxWidth: CONTENT_WIDTH / 2 - 6 });

    let by = boxT + 5;
    value(doc, `Pickup #: ${stop.pickup_number || '—'}  BOL #: ${stop.shipment_bol_number || '—'}`, colB, by, { size: 7.5 });
    by += 4.5;
    value(doc, `PO #: ${stop.po_number || '—'}  Seal #: ${stop.seal_number || '—'}`, colB, by, { size: 7.5 });
    by += 4.5;
    value(doc, `Container: ${stop.container_number || '—'}  Chassis: ${stop.chassis_number || '—'}`, colB, by, { size: 7.5 });
    by += 4.5;
    value(doc, `Qty: ${formatNumber(stop.total_qty)}  Weight: ${formatNumber(stop.total_weight)}`, colB, by, { size: 7.5 });
    by += 4.5;
    value(doc, `Commodity: ${stop.commodity || '—'}`, colB, by, { size: 7.5 });

    y = boxT + boxHeight + 6;
  }

  // --- Signature grid (4-col: In/Out time, driver, shipper, carrier, consignee) ---
  y = ensureSpace(doc, y, 40);
  y = drawBanner(doc, PAGE.margin, y, CONTENT_WIDTH, 'SIGNATURES');
  y += 6;
  const cellWidth = CONTENT_WIDTH / 2 - 3;
  const rowsSig = [
    ['In Time', 'Out Time'],
    ['Driver Name', 'Driver Cell Phone'],
    ['Shipper Signature / Date', 'Pickup Carrier Signature / Date'],
    ['Consignee Signature / Date', ''],
  ];
  for (const [left, right] of rowsSig) {
    doc.setDrawColor(150, 150, 150);
    doc.line(PAGE.margin, y, PAGE.margin + cellWidth, y);
    doc.setFontSize(7.5);
    doc.text(left, PAGE.margin, y + 4);
    if (right) {
      doc.line(PAGE.margin + cellWidth + 6, y, PAGE.margin + cellWidth + 6 + cellWidth, y);
      doc.text(right, PAGE.margin + cellWidth + 6, y + 4);
    }
    y += 12;
  }

  stampFooters(doc, { loadNumber: load.load_number, carrierName: carrier?.carrier_name });
  return toBuffer(doc);
}

module.exports = { generateBOLPDF };
