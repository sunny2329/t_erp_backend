const {
  PAGE, CONTENT_WIDTH, newDoc, toBuffer, ensureSpace, drawBanner, field, value,
  formatNumber, formatMoney, formatDate, formatDateTime, addressLine, fetchLogoBase64, stampFooters
} = require('./pdfHelpers');

const STOP_TYPE_LABELS = { 1: 'Pickup', 2: 'Delivery' };

// The same generator backs both "Load Confirmation" (viewed in-app) and
// "Rate Confirmation" (sent to the carrier for the dispatched leg) — in the
// reference project these are literally the same PDF (doc_type_id 4), just
// triggered from two different places. data: { carrier (booking authority),
// dispatchCarrier, assignment (load_assignments row), load, stops }
async function generateLoadConfirmationPDF(data) {
  const { carrier, dispatchCarrier, assignment, load, stops } = data;
  const doc = newDoc();
  let y = PAGE.margin;

  const logo = await fetchLogoBase64(carrier?.logo_url);
  if (logo) {
    try { doc.addImage(logo.data, logo.format, PAGE.margin, y, 28, 14); } catch (_) { /* fall through */ }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(carrier?.carrier_name || 'Booking Authority', PAGE.margin, y + 8);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('RATE / LOAD CONFIRMATION', PAGE.width - PAGE.margin, y + 6, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Load # ${load.load_number || ''}  ·  ${formatDate(load.load_dt)}`, PAGE.width - PAGE.margin, y + 11, { align: 'right' });
  y += 18;

  doc.setDrawColor(200, 200, 200);
  doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
  y += 6;

  // --- Booking Authority / Route ---
  const colWidth = CONTENT_WIDTH / 2 - 3;
  let leftY = y;
  let rightY = y;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('BOOKING AUTHORITY', PAGE.margin, leftY);
  leftY += 5;
  leftY = field(doc, carrier?.carrier_name, 'Company', PAGE.margin, leftY) + 5;
  leftY = field(doc, `MC# ${carrier?.mc_number || '—'}  ·  DOT# ${carrier?.dot_number || '—'}`, 'Authority', PAGE.margin, leftY) + 5;
  leftY = field(doc, carrier?.remit_phone || carrier?.bill_to_email || '', 'Contact', PAGE.margin, leftY) + 5;

  const origin = stops[0]?.location;
  const destination = stops[stops.length - 1]?.location;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('ROUTE', PAGE.margin + colWidth + 6, rightY);
  rightY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const originLabel = origin ? `${origin.city_name || ''}, ${origin.state_name || ''}` : '—';
  const destLabel = destination ? `${destination.city_name || ''}, ${destination.state_name || ''}` : '—';
  doc.text(originLabel, PAGE.margin + colWidth + 6, rightY + 4);
  doc.setTextColor(204, 85, 0);
  doc.text('TO', PAGE.margin + colWidth + 6, rightY + 9);
  doc.setTextColor(0, 0, 0);
  doc.text(destLabel, PAGE.margin + colWidth + 6, rightY + 14);
  rightY += 20;
  rightY = field(doc, load.tendered_miles ? `${load.tendered_miles} mi` : '—', 'Distance', PAGE.margin + colWidth + 6, rightY) + 5;

  y = Math.max(leftY, rightY) + 4;

  // --- Carrier / Equipment two-column box ---
  y = ensureSpace(doc, y, 46);
  const boxTop = y;
  const carrierColWidth = CONTENT_WIDTH * 0.58;
  const equipColWidth = CONTENT_WIDTH - carrierColWidth - 3;
  drawBanner(doc, PAGE.margin, boxTop, carrierColWidth, 'CARRIER INFORMATION');
  drawBanner(doc, PAGE.margin + carrierColWidth + 3, boxTop, equipColWidth, 'EQUIPMENT');

  let cy = boxTop + 10;
  cy = field(doc, dispatchCarrier?.carrier_name, 'Carrier', PAGE.margin + 2, cy) + 5;
  cy = field(doc, `MC# ${dispatchCarrier?.mc_number || '—'}  ·  DOT# ${dispatchCarrier?.dot_number || '—'}`, 'Authority', PAGE.margin + 2, cy) + 5;
  cy = field(doc, assignment?.driver_name, 'Primary Driver', PAGE.margin + 2, cy) + 5;
  cy = field(doc, assignment?.driver_phone, 'Driver Phone', PAGE.margin + 2, cy) + 5;
  if (assignment?.secondary_driver_name) {
    cy = field(doc, assignment.secondary_driver_name, 'Secondary Driver', PAGE.margin + 2, cy) + 5;
  }

  let ey = boxTop + 10;
  const eqX = PAGE.margin + carrierColWidth + 5;
  ey = field(doc, assignment?.vehicle_no, 'Truck #', eqX, ey) + 5;
  ey = field(doc, assignment?.trailer_no, 'Trailer #', eqX, ey) + 5;
  ey = field(doc, load.weight ? `${formatNumber(load.weight)} lbs` : '—', 'Weight', eqX, ey) + 5;

  y = Math.max(cy, ey) + 6;

  // --- Stops ---
  for (const [i, stop] of stops.entries()) {
    y = ensureSpace(doc, y, 30);
    const label = `Stop # ${i + 1} (${STOP_TYPE_LABELS[stop.stop_type_id] || 'Stop'})`;
    y = drawBanner(doc, PAGE.margin, y, CONTENT_WIDTH, label);
    const boxT = y;
    const boxHeight = 24;
    doc.setDrawColor(200, 200, 200);
    doc.rect(PAGE.margin, boxT, CONTENT_WIDTH, boxHeight);
    const loc = stop.location || {};
    const colA = PAGE.margin + 3;
    const colB = PAGE.margin + CONTENT_WIDTH / 2 + 3;
    let ay = boxT + 5;
    value(doc, `${formatDateTime(stop.start_dt)} — ${formatDateTime(stop.end_dt)}`, colA, ay, { size: 8, bold: true });
    ay += 5;
    value(doc, loc.location_name || '—', colA, ay, { size: 8 });
    ay += 4.5;
    value(doc, addressLine(loc), colA, ay, { size: 7.5, maxWidth: CONTENT_WIDTH / 2 - 6 });
    ay += 4.5;
    value(doc, stop.instructions || '', colA, ay, { size: 7, maxWidth: CONTENT_WIDTH / 2 - 6 });

    let by = boxT + 5;
    value(doc, `Pickup #: ${stop.pickup_number || '—'}  BOL #: ${stop.shipment_bol_number || '—'}`, colB, by, { size: 7.5 });
    by += 4.5;
    value(doc, `PO #: ${stop.po_number || '—'}  Seal #: ${stop.seal_number || '—'}`, colB, by, { size: 7.5 });
    by += 4.5;
    value(doc, `Container: ${stop.container_number || '—'}  Trailer: ${stop.customer_trailer_number || '—'}`, colB, by, { size: 7.5 });
    by += 4.5;
    value(doc, `Qty: ${formatNumber(stop.total_qty)}  Weight: ${formatNumber(stop.total_weight)}  ${stop.commodity || ''}`, colB, by, { size: 7.5 });

    y = boxT + boxHeight + 6;
  }

  // --- Pay Items ---
  y = ensureSpace(doc, y, 30);
  y = drawBanner(doc, PAGE.margin, y, CONTENT_WIDTH, 'PAY ITEMS');
  const primaryFee = Number(load.primary_fee) || 0;
  const fuelSurcharge = Number(load.fuel_surcharge) || 0;
  const payItems = [
    { description: 'Line Haul', amount: primaryFee },
    ...(fuelSurcharge ? [{ description: 'Fuel Surcharge', amount: fuelSurcharge }] : []),
  ];
  doc.setFontSize(8.5);
  for (const item of payItems) {
    doc.setFont('helvetica', 'normal');
    doc.text(item.description, PAGE.margin + 2, y + 5);
    doc.setFont('helvetica', 'bold');
    doc.text(formatMoney(item.amount), PAGE.width - PAGE.margin - 2, y + 5, { align: 'right' });
    y += 5.5;
  }
  doc.setDrawColor(150, 150, 150);
  doc.line(PAGE.margin, y + 1, PAGE.width - PAGE.margin, y + 1);
  y += 5.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('GRAND TOTAL', PAGE.margin + 2, y + 4);
  doc.text(formatMoney(primaryFee + fuelSurcharge), PAGE.width - PAGE.margin - 2, y + 4, { align: 'right' });
  y += 12;

  // --- Signature ---
  y = ensureSpace(doc, y, 24);
  doc.setDrawColor(120, 120, 120);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.line(PAGE.margin, y, PAGE.margin + 70, y);
  doc.text('Driver Signature', PAGE.margin, y + 4);
  doc.line(PAGE.margin + 90, y, PAGE.margin + 130, y);
  doc.text('Date', PAGE.margin + 90, y + 4);

  stampFooters(doc, { loadNumber: load.load_number, carrierName: carrier?.carrier_name });
  return toBuffer(doc);
}

module.exports = { generateLoadConfirmationPDF };
