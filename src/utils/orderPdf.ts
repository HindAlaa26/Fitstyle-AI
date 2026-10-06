import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { SHOP, mapsLink } from "../config/shop";
import type { PlacedOrder } from "../components/CheckoutDialog";

type RGB = [number, number, number];

// App palette
const C = {
  primary: [90, 0, 90] as RGB,       // #5a005a
  secondary: [172, 36, 113] as RGB,  // #ac2471
  tint: [255, 239, 248] as RGB,      // #ffeff8
  tintSoft: [255, 247, 251] as RGB,
  border: [214, 192, 207] as RGB,    // #d6c0cf
  muted: [132, 114, 127] as RGB,     // #84727f
  text: [34, 25, 32] as RGB,         // #221920
  textSoft: [82, 66, 78] as RGB,     // #52424e
  white: [255, 255, 255] as RGB,
};

// jsPDF's built-in fonts only support Latin characters
const clean = (s: unknown) =>
  String(s ?? "").replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "").trim();
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "." : s);
const usd = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;
const isPending = (status: string) => /pending/i.test(status || "");
const pieceCount = (order: PlacedOrder) => order.items.reduce((t, i) => t + i.quantity, 0);

// Loads a product photo as a small JPEG data URL (cover-cropped to w x h).
// Returns null if there is no image or the host blocks cross-origin use; the PDF
// then draws a neutral placeholder instead.
function loadProductImage(url?: string, w = 160, h = 200): Promise<string | null> {
  return new Promise((resolve) => {
    if (!url || !/^(https?:|data:image)/i.test(url)) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), 7000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        if (!img.width || !img.height) return resolve(null);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        const scale = Math.max(w / img.width, h / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

// Plain-text QR payload: any phone scanner shows it, no internet needed.
// Kept short (<= ~900 chars) so the QR stays easy to scan. The order id, SKU,
// quantity, line price and the total are always kept.
export function buildQrText(order: PlacedOrder): string {
  const when = new Date(order.date).toISOString().slice(0, 10);
  const head =
    `FITSTYLE AI | ORDER ${order.orderId}\n` +
    `${when} | ${isPending(order.status) ? "PAY IN STORE" : clean(order.status).toUpperCase()}`;
  const total = `ITEMS ${pieceCount(order)} | TOTAL ${usd(order.totalAmount)}`;

  const build = (nameLen: number, withColour: boolean, withSize: boolean, maxLines: number) => {
    const lines = order.items.slice(0, maxLines).map((it) => {
      const parts = [`${it.quantity}x ${cut(clean(it.name), nameLen)}`, clean(it.sku)];
      if (withSize && it.size) parts.push(clean(it.size));
      if (withColour && it.colour) parts.push(clean(it.colour));
      parts.push(usd(it.lineTotal));
      return parts.join(" | ");
    });
    if (order.items.length > maxLines) {
      lines.push(`+${order.items.length - maxLines} more items`);
    }
    return [head, ...lines, total].join("\n");
  };

  const attempts: Array<[number, boolean, boolean, number]> = [
    [28, true, true, 99],
    [24, false, true, 99],
    [20, false, false, 99],
    [18, false, false, 12],
    [16, false, false, 8],
  ];
  for (const [nameLen, colour, size, maxLines] of attempts) {
    const text = build(nameLen, colour, size, maxLines);
    if (text.length <= 900) return text;
  }
  return build(14, false, false, 5);
}

// A small illustrative map card (pin + streets). The whole card is a link that
// opens Google Maps on the shop.
function drawMapCard(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setFillColor(...C.tint);
  doc.rect(x, y, w, h, "F");

  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.2);
  for (let gx = x + 10; gx < x + w; gx += 12) doc.line(gx, y, gx, y + h);
  for (let gy = y + 6; gy < y + h; gy += 8) doc.line(x, gy, x + w, gy);

  doc.setDrawColor(...C.white);
  doc.setLineWidth(1.6);
  doc.line(x, y + h * 0.65, x + w, y + h * 0.3);
  doc.line(x + w * 0.32, y, x + w * 0.5, y + h);

  // pin
  const cx = x + w * 0.5;
  const cy = y + h * 0.5;
  doc.setFillColor(...C.secondary);
  doc.circle(cx, cy - 3, 3.4, "F");
  doc.triangle(cx - 2.6, cy - 1.4, cx + 2.6, cy - 1.4, cx, cy + 3.2, "F");
  doc.setFillColor(...C.white);
  doc.circle(cx, cy - 3, 1.2, "F");

  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h, "S");

  // hint label
  doc.setFillColor(...C.white);
  doc.roundedRect(x + w - 36, y + h - 7.4, 34, 5.4, 2.2, 2.2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.setTextColor(...C.primary);
  doc.text("TAP TO OPEN MAP", x + w - 19, y + h - 3.7, { align: "center" });

  doc.link(x, y, w, h, { url: mapsLink() });
}

export async function downloadOrderPdf(order: PlacedOrder): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setProperties({ title: `FitStyle AI Order ${order.orderId}` });

  const PW = 210;
  const ML = 14;
  const CW = PW - ML * 2; // 182
  const pending = isPending(order.status);

  const itemImages = await Promise.all(order.items.map((it) => loadProductImage(it.image)));

  const qrDataUrl = await QRCode.toDataURL(buildQrText(order), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 700,
  });

  // ---------- Header ----------
  doc.setFillColor(...C.tint);
  doc.circle(PW, 0, 30, "F"); // soft corner accent

  doc.setFont("times", "bolditalic");
  doc.setFontSize(28);
  doc.setTextColor(...C.primary);
  doc.text("FitStyle AI", PW / 2, 22, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.muted);
  doc.text("ORDER SUMMARY", PW / 2, 29.5, { align: "center", charSpace: 1.6 });

  doc.setDrawColor(...C.primary);
  doc.setLineWidth(0.6);
  doc.line(PW / 2 - 12, 33, PW / 2 + 12, 33);

  // ---------- Four info tiles ----------
  const dateText = new Date(order.date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const tiles: Array<[string, string]> = [
    ["ORDER ID", order.orderId],
    ["DATE", dateText],
    ["CUSTOMER", clean(order.customerName) || "Customer"],
    ["STATUS", pending ? "Pay in store" : clean(order.status) || "Paid"],
  ];
  const tileW = (CW - 3 * 4) / 4;
  tiles.forEach(([label, value], i) => {
    const x = ML + i * (tileW + 4);
    doc.setFillColor(...C.tint);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, 40, tileW, 18, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.text(label, x + 3.5, 46.5);
    doc.setFontSize(9);
    doc.setTextColor(...(i === 3 ? C.secondary : C.primary));
    doc.text(cut(clean(value), 20), x + 3.5, 53.5);
  });

  // ---------- Shop location card (left) ----------
  const rowY = 64;
  const rowH = 68;
  const leftW = 108;
  doc.setFillColor(...C.white);
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(ML, rowY, leftW, rowH, 2.5, 2.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...C.secondary);
  doc.text("SHOP LOCATION", ML + 4, rowY + 6, { charSpace: 0.8 });

  doc.setFont("times", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...C.primary);
  doc.text(cut(clean(SHOP.name), 40), ML + 4, rowY + 12.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C.textSoft);
  const addressLines = doc.splitTextToSize(clean(SHOP.address), leftW - 8).slice(0, 2);
  doc.text(addressLines, ML + 4, rowY + 17.5);
  doc.setFontSize(7.5);
  doc.setTextColor(...C.muted);
  doc.text(cut(`Tel ${clean(SHOP.phone)}  |  ${clean(SHOP.hours)}`, 62), ML + 4, rowY + 26);

  drawMapCard(doc, ML + 4, rowY + 29, leftW - 8, 26);

  // "Open in Google Maps" button
  doc.setFillColor(...C.primary);
  doc.roundedRect(ML + 4, rowY + 57.5, leftW - 8, 7, 1.8, 1.8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.white);
  doc.text("OPEN IN GOOGLE MAPS", ML + leftW / 2, rowY + 62.1, { align: "center", charSpace: 0.6 });
  doc.link(ML + 4, rowY + 57.5, leftW - 8, 7, { url: mapsLink() });

  // ---------- QR card (right) ----------
  const rx = ML + leftW + 4;
  const rw = CW - leftW - 4; // 70
  doc.setFillColor(...C.white);
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(rx, rowY, rw, rowH, 2.5, 2.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...C.secondary);
  doc.text("SCAN AT THE STORE", rx + rw / 2, rowY + 6, { align: "center", charSpace: 0.8 });

  doc.addImage(qrDataUrl, "PNG", rx + (rw - 44) / 2, rowY + 9, 44, 44);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(...C.textSoft);
  doc.text("Lists every item, size and price", rx + rw / 2, rowY + 58, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.primary);
  doc.text(`Order ${order.orderId}`, rx + rw / 2, rowY + 63, { align: "center" });

  // ---------- Note ----------
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.textSoft);
  doc.text(
    pending
      ? "Show this document or the QR code at the store counter to complete your payment and pick up your order."
      : "Thank you for your order. Show the QR code at the store to pick up your pieces.",
    PW / 2,
    rowY + rowH + 7,
    { align: "center" }
  );

  // ---------- Items table ----------
  const tableTitleY = rowY + rowH + 17; // 149
  doc.setFont("times", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...C.primary);
  doc.text("Itemized Selection", ML, tableTitleY);
  {
    const n = pieceCount(order);
    const styles = order.items.length;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...C.secondary);
    doc.text(
      `${n} ${n === 1 ? "piece" : "pieces"}  |  ${styles} ${styles === 1 ? "style" : "styles"}`,
      PW - ML,
      tableTitleY,
      { align: "right" }
    );
  }
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(ML, tableTitleY + 2.5, PW - ML, tableTitleY + 2.5);

  autoTable(doc, {
    startY: tableTitleY + 6,
    margin: { left: ML, right: ML, top: 20, bottom: 34 },
    head: [["", "PRODUCT", "SIZE", "COLOR", "QTY", "UNIT PRICE", "TOTAL"]],
    body: order.items.map((it) => [
      "",
      `${clean(it.name)}\nSKU: ${clean(it.sku)}`,
      clean(it.size) || "-",
      clean(it.colour) || "-",
      String(it.quantity),
      usd(it.unitPrice),
      usd(it.lineTotal),
    ]),
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      textColor: C.text,
      lineColor: C.border,
      lineWidth: 0.15,
      cellPadding: 2.6,
      valign: "middle",
      overflow: "linebreak",
    },
    bodyStyles: { minCellHeight: 25 },
    headStyles: { fillColor: C.primary, textColor: 255, fontStyle: "bold", fontSize: 7.5 },
    alternateRowStyles: { fillColor: C.tintSoft },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: "auto" },
      2: { halign: "center", cellWidth: 14 },
      3: { cellWidth: 26 },
      4: { halign: "center", cellWidth: 12, fontStyle: "bold" },
      5: { halign: "right", cellWidth: 22 },
      6: { halign: "right", cellWidth: 24, fontStyle: "bold" },
    },
    didParseCell: (d) => {
      if (d.section === "head") {
        const i = d.column.index;
        d.cell.styles.halign = i === 2 || i === 4 ? "center" : i >= 5 ? "right" : "left";
      }
    },
    didDrawCell: (d) => {
      if (d.section !== "body" || d.column.index !== 0) return;
      const img = itemImages[d.row.index];
      const x = d.cell.x + 2.5;
      const y = d.cell.y + 2.5;
      const w = 15;
      const h = 19;
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.2);
      if (img) {
        doc.addImage(img, "JPEG", x, y, w, h);
        doc.rect(x, y, w, h, "S");
      } else {
        doc.setFillColor(...C.tint);
        doc.rect(x, y, w, h, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.5);
        doc.setTextColor(...C.muted);
        doc.text("NO IMAGE", x + w / 2, y + h / 2 + 1, { align: "center" });
      }
    },
  });

  // ---------- Totals ----------
  let y = ((doc as any).lastAutoTable?.finalY ?? 160) + 8;
  if (y > 232) {
    doc.addPage();
    y = 24;
  }
  const bx = PW - ML - 86;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...C.textSoft);
  doc.text(`SUBTOTAL (${pieceCount(order)} ${pieceCount(order) === 1 ? "piece" : "pieces"})`, bx, y + 3);
  doc.text("PAYMENT", bx, y + 9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.text);
  doc.text(usd(order.subtotal), PW - ML, y + 3, { align: "right" });
  doc.setTextColor(...(pending ? C.secondary : C.text));
  doc.text(pending ? "Due at the store" : "Paid", PW - ML, y + 9, { align: "right" });

  doc.setFillColor(...C.primary);
  doc.roundedRect(bx, y + 14, 86, 13, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C.white);
  doc.text("TOTAL", bx + 5, y + 22, { charSpace: 0.8 });
  doc.setFont("times", "bold");
  doc.setFontSize(15);
  doc.text(usd(order.totalAmount), PW - ML - 5, y + 22.6, { align: "right" });

  // ---------- Footer + page numbers on every page ----------
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);

    if (p > 1) {
      doc.setFont("times", "bolditalic");
      doc.setFontSize(11);
      doc.setTextColor(...C.primary);
      doc.text(`FitStyle AI  -  Order ${order.orderId}`, ML, 13);
    }

    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(ML, 272, PW - ML, 272);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.primary);
    doc.text("SHOP", ML, 277);
    doc.text("CONTACT", PW / 2, 277, { align: "center" });
    doc.text("HOURS", PW - ML, 277, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.textSoft);
    doc.text(cut(clean(SHOP.address), 44), ML, 281.5);
    doc.text(clean(SHOP.phone), PW / 2, 281.5, { align: "center" });
    doc.text(clean(SHOP.hours), PW - ML, 281.5, { align: "right" });

    doc.setFont("times", "bolditalic");
    doc.setFontSize(9.5);
    doc.setTextColor(...C.primary);
    doc.text("Thank you for choosing curated elegance.", PW / 2, 288, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...C.muted);
    doc.text(
      `© ${new Date().getFullYear()} FitStyle AI. Curated elegance for the modern woman.   Page ${p} of ${pages}`,
      PW / 2,
      293,
      { align: "center" }
    );
  }

  doc.save(`FitStyle_Order_${order.orderId}.pdf`);
}
