import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ShiftPDFData = {
  shiftName: string;
  cashierName: string;
  teamMembers: string;
  startTime: number;
  endTime: number;
  startingCash: number;
  cashRevenue: number;
  paymentBreakdown: Record<string, any>;
  totalExpenses: number;
  totalDiscount: number;
  totalItemsSold: number;
  cashInRegister: number;
  cashBreakdown: Record<string, number>;
  notes: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtNb(n: number): string {
  const s = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `Rp\u00A0${s}`;
}

function fmtRibuan(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

// ─── HTML builder – compact text style ──────────────────────────────────────

function buildReportHTML(data: ShiftPDFData, logoBase64: string): string {
  const {
      shiftName, cashierName, startingCash, cashRevenue,
      paymentBreakdown, totalExpenses, totalItemsSold, totalDiscount,
      cashInRegister, cashBreakdown, notes, startTime, endTime,
    } = data;

  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" style="width:24px;height:24px;border-radius:6px;" />`
    : `<div style="width:24px;height:24px;border-radius:6px;background:linear-gradient(135deg,#059669,#10b981);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fff;">DT</div>`;

  const pb = paymentBreakdown || {};
  const nonTunaiRows: { label: string; value: number }[] = [];
  if (pb.qris) nonTunaiRows.push({ label: "QRIS", value: pb.qris });
  if ((pb.debit || 0) + (pb.credit || 0) > 0)
    nonTunaiRows.push({ label: "EDC", value: (pb.debit || 0) + (pb.credit || 0) });
  const ofp = pb.onlineFoodPlatforms || {};
  const platformLabels: Record<string, string> = { grab: "GrabFood", gofood: "GoFood", maxim: "Maxim", shopeefood: "ShopeeFood" };
  Object.entries(ofp).filter(([_, v]) => Number(v) > 0).forEach(([p, v]) => nonTunaiRows.push({ label: platformLabels[p] || p, value: Number(v) }));
  if (pb.transfer) nonTunaiRows.push({ label: "Transfer", value: pb.transfer });

  const totalNonTunai = nonTunaiRows.reduce((s, r) => s + r.value, 0);
  const totalPenjualan = cashRevenue + totalNonTunai;
  const selisih = cashInRegister - cashRevenue;
  const selisihColor = selisih >= 0 ? "#059669" : "#dc2626";
  const selisihIcon = selisih === 0 ? "" : selisih > 0 ? "⬆" : "⬇";
  const selisihTxt = selisih === 0 ? "Rp 0" : `${selisihIcon} Rp ${fmtRibuan(Math.abs(selisih))}`;

  const pecahanEntries = Object.entries(cashBreakdown)
    .filter(([_, c]) => Number(c) > 0)
    .sort(([a], [b]) => Number(b.replace("bill", "")) - Number(a.replace("bill", "")));
  const totalPecahan = pecahanEntries.reduce((sum, [k, c]) => sum + Number(k.replace("bill", "")) * Number(c), 0);

  const tgl = fmtDate(startTime);
  const mulai = fmtTime(startTime);
  const selesai = endTime ? fmtTime(endTime) : "-";
  const jamRange = `${mulai} - ${selesai} WIB`;

  // 💄 Compact inline styles
  const S = {
    page: "width:340px;background:#fff;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;overflow:hidden;",
    header: "background:linear-gradient(135deg,#059669,#10b981);padding:10px 12px;display:flex;align-items:center;gap:10px;",
    title: "font-size:13px;font-weight:800;color:#fff;",
    subtitle: "font-size:7px;color:rgba(255,255,255,0.75);",
    sec: "font-size:7px;font-weight:700;color:#6b7280;padding:8px 12px 2px;text-transform:uppercase;letter-spacing:0.5px;",
    sep: "height:1px;background:#e5e7eb;margin:0 12px;",
    row: "display:flex;justify-content:space-between;padding:2px 12px;align-items:center;",
    label: "font-size:7.5px;color:#6b7280;",
    value: "font-size:8px;font-weight:700;color:#1f2937;",
    green: "color:#059669;",
    red: "color:#dc2626;",
    foot: "padding:6px 12px 10px;text-align:center;font-size:6.5px;color:#9ca3af;",
  };

  const nonTunaiHtml = nonTunaiRows.map(r =>
    `<div style="${S.row}"><span style="${S.label}">${r.label}</span><span style="${S.value}">${fmtNb(r.value)}</span></div>`
  ).join("");

  const pecahanHtml = pecahanEntries.length ? `
    <div style="${S.sep};margin-top:6px;margin-bottom:4px;"></div>
    ${pecahanEntries.map(([k, c]) => {
      const nominal = Number(k.replace("bill", ""));
      return `<div style="display:flex;justify-content:space-between;padding:1px 12px;">
        <span style="font-size:7px;color:#9ca3af;">${fmtNb(nominal)}</span>
        <span style="font-size:7px;font-weight:700;color:#1f2937;">× ${c} = ${fmtNb(nominal * Number(c))}</span>
      </div>`;
    }).join("")}
    <div style="display:flex;justify-content:space-between;padding:3px 12px;margin-top:2px;background:#f0fdf4;">
      <span style="font-size:7.5px;font-weight:700;color:#059669;">Total Uang Fisik</span>
      <span style="font-size:8px;font-weight:800;color:#059669;">${fmtNb(totalPecahan)}</span>
    </div>
  ` : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<div style="${S.page}">

  <!-- HEADER -->
  <div style="${S.header}">
    ${logoHtml}
    <div style="flex:1;">
      <div style="${S.title}">Djiwa Tentram</div>
      <div style="${S.subtitle}">${tgl} · ${shiftName}</div>
    </div>
    <div style="font-size:10px;font-weight:800;color:#fff;text-align:right;">LAPORAN<br>SHIFT</div>
  </div>

  <!-- INFO -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#e5e7eb;">
    <div style="background:#fff;padding:5px 8px;"><div style="font-size:6.5px;color:#9ca3af;">Kasir</div><div style="font-size:9px;font-weight:700;color:#1f2937;">${cashierName}</div></div>
    <div style="background:#fff;padding:5px 8px;"><div style="font-size:6.5px;color:#9ca3af;">Jam</div><div style="font-size:9px;font-weight:700;color:#1f2937;">${jamRange}</div></div>
  </div>

  <!-- SISTEM -->
  <div style="${S.sec}">DI SISTEM</div>
  <div style="${S.row}"><span style="${S.label}">Modal Kasir</span><span style="${S.value}">${fmtNb(startingCash)}</span></div>
  <div style="${S.row}"><span style="${S.label}">Penjualan Tunai</span><span style="${S.value}${S.green}">${fmtNb(cashRevenue)}</span></div>
  <div style="${S.row}"><span style="${S.label}">Non-Tunai</span><span style="${S.value}">${fmtNb(totalNonTunai)}</span></div>
  ${nonTunaiHtml}
  <div style="${S.row}"><span style="${S.label}">Pengeluaran</span><span style="font-size:8px;font-weight:700;${S.red}">${fmtNb(totalExpenses)}</span></div>
  <div style="${S.row}"><span style="${S.label}">Item Terjual</span><span style="${S.value}">${totalItemsSold}</span></div>
  ${totalDiscount > 0 ? `<div style="${S.row}"><span style="${S.label}">Diskon</span><span style="font-size:8px;font-weight:700;${S.red}">-${fmtNb(totalDiscount)}</span></div>` : ""}

  <!-- LACI -->
  <div style="${S.sep}"></div>
  <div style="${S.sec}">DI LACI</div>
  <div style="${S.row}"><span style="${S.label}">Modal Kasir</span><span style="${S.value}">${fmtNb(startingCash)}</span></div>
  <div style="${S.row}"><span style="${S.label}">Uang Fisik</span><span style="${S.value}${S.green}">${fmtNb(cashInRegister)}</span></div>
  ${pecahanHtml}

  <!-- SELISIH -->
  <div style="${S.sep}"></div>
  <div style="${S.sec}">SELISIH</div>
  <div style="${S.row}"><span style="${S.label}">Penjualan Tunai</span><span style="${S.value}">${fmtNb(cashRevenue)}</span></div>
  <div style="${S.row}"><span style="${S.label}">Uang Fisik</span><span style="${S.value}${S.green}">${fmtNb(cashInRegister)}</span></div>
  <div style="${S.row};margin-top:3px;padding:4px 12px;background:${selisih >= 0 ? '#f0fdf4' : '#fef2f2'};border-radius:4px;margin-left:12px;margin-right:12px;">
    <span style="font-size:8px;font-weight:700;${selisihColor};">Selisih</span>
    <span style="font-size:9px;font-weight:800;${selisihColor};">${selisihTxt}</span>
  </div>
  ${notes ? `<div style="font-size:7px;color:#6b7280;font-style:italic;padding:4px 12px;margin-top:3px;">Catatan: ${notes}</div>` : ""}

  <!-- FOOTER -->
  <div style="${S.foot}">
    Djiwa Tentram · Kopi &amp; Eatery
  </div>

</div>
</body></html>`;
}

// ─── Generate PDF ────────────────────────────────────────────────────────────

export async function generateShiftReportPDF(data: ShiftPDFData): Promise<Blob> {
  const logoBase64 = await loadLogoBase64();
  const html = buildReportHTML(data, logoBase64);

  const container = document.createElement("div");
  container.innerHTML = html;
  container.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:340px;";
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#f1f5f9",
      width: 340,
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdfH = canvas.height * 0.5;
    const pdf = new jsPDF({
      orientation: pdfH > 340 ? "portrait" : "portrait",
      unit: "px",
      format: [340, Math.max(pdfH, 200)],
    });

    pdf.addImage(imgData, "PNG", 0, 0, 340, pdfH);
    return pdf.output("blob");
  } finally {
    document.body.removeChild(container);
  }
}

async function loadLogoBase64(): Promise<string> {
  try {
    const res = await fetch("/logo.png");
    if (!res.ok) return "";
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read logo blob"));
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}
