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

// ─── HTML builder – Clean & Compact ──────────────────────────────────────────

function buildReportHTML(data: ShiftPDFData, logoBase64: string): string {
  const {
    shiftName, cashierName, startingCash, cashRevenue,
    paymentBreakdown, totalExpenses, totalItemsSold, totalDiscount,
    cashInRegister, cashBreakdown, notes, startTime, endTime,
  } = data;

  // Math
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

  const selisih = cashInRegister - cashRevenue;
  const selisihUp = selisih >= 0;
  const selisihColor = selisihUp ? "#059669" : "#dc2626";
  const selisihBg = selisihUp ? "#f0fdf4" : "#fef2f2";
  const selisihTxt = selisih === 0 ? "Rp 0" : `${selisihUp ? "Naik" : "Turun"} Rp ${fmtRibuan(Math.abs(selisih))}`;

  const pecahanEntries = Object.entries(cashBreakdown)
    .filter(([_, c]) => Number(c) > 0)
    .sort(([a], [b]) => Number(b.replace("bill", "")) - Number(a.replace("bill", "")));
  const totalPecahan = pecahanEntries.reduce((sum, [k, c]) => sum + Number(k.replace("bill", "")) * Number(c), 0);

  const tgl = fmtDate(startTime);
  const mulai = fmtTime(startTime);
  const selesai = endTime ? fmtTime(endTime) : "-";
  const jamRange = `${mulai} - ${selesai} WIB`;

  const nonTunaiHtml = nonTunaiRows.length
    ? nonTunaiRows.map(r =>
        `<tr><td style="padding:2px 16px;font-size:6.5px;color:#6b7280;">${r.label}</td><td style="padding:2px 16px;text-align:right;font-size:7px;font-weight:700;color:#1f2937;">${fmtNb(r.value)}</td></tr>`
      ).join("")
    : "";

  const pecahanHtml = pecahanEntries.length
    ? `<div style="padding:4px 16px 0;">
        <div style="font-size:6.5px;font-weight:700;color:#059669;margin-bottom:3px;">PECAHAN</div>
        ${pecahanEntries.map(([k, c]) => {
          const nominal = Number(k.replace("bill", ""));
          return `<div style="display:flex;padding:1px 0;">
            <span style="font-size:6.5px;color:#9ca3af;width:60px;">${fmtNb(nominal)}</span>
            <span style="font-size:6.5px;color:#9ca3af;width:25px;">× ${c}</span>
            <span style="font-size:7px;font-weight:700;color:#1f2937;text-align:right;flex:1;">= ${fmtNb(nominal * Number(c))}</span>
          </div>`;
        }).join("")}
      </div>
      <div style="margin:3px 16px 0;padding:3px 8px;background:#f0fdf4;border-radius:3px;display:flex;justify-content:space-between;">
        <span style="font-size:7px;font-weight:700;color:#059669;">Total Uang Fisik</span>
        <span style="font-size:8px;font-weight:800;color:#059669;">${fmtNb(totalPecahan)}</span>
      </div>`
    : `<div style="margin:3px 16px 0;padding:3px 8px;background:#f0fdf4;border-radius:3px;display:flex;justify-content:space-between;">
        <span style="font-size:7px;font-weight:700;color:#059669;">Uang Fisik</span>
        <span style="font-size:8px;font-weight:800;color:#059669;">${fmtNb(cashInRegister)}</span>
      </div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="width:380px;background:#fff;margin:0 auto;overflow:hidden;padding-bottom:8px;">

  <!-- HEADER -->
  <div style="background:linear-gradient(135deg,#059669,#10b981);padding:8px 16px;display:flex;align-items:center;gap:8px;">
    ${logoBase64
      ? `<img src="${logoBase64}" style="width:22px;height:22px;border-radius:5px;" />`
      : `<div style="width:22px;height:22px;border-radius:5px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:#059669;">DT</div>`
    }
    <div style="flex:1;">
      <div style="font-size:12px;font-weight:800;color:#fff;">Djiwa Tentram</div>
      <div style="font-size:6px;color:rgba(255,255,255,0.7);">Kopi &amp; Eatery</div>
    </div>
    <div style="font-size:9px;font-weight:800;color:#fff;text-align:right;">LAPORAN<br/>SHIFT</div>
  </div>

  <!-- INFO CARDS -->
  <table style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="width:33.33%;border:1px solid #e5e7eb;padding:5px 6px;text-align:center;">
        <div style="font-size:5.5px;color:#9ca3af;">Kasir</div>
        <div style="font-size:8px;font-weight:700;color:#1f2937;">${cashierName}</div>
      </td>
      <td style="width:33.33%;border:1px solid #e5e7eb;padding:5px 6px;text-align:center;">
        <div style="font-size:5.5px;color:#9ca3af;">Shift</div>
        <div style="font-size:8px;font-weight:700;color:#1f2937;">${shiftName}</div>
      </td>
      <td style="width:33.34%;border:1px solid #e5e7eb;padding:5px 6px;text-align:center;">
        <div style="font-size:5.5px;color:#9ca3af;">Jam</div>
        <div style="font-size:8px;font-weight:700;color:#1f2937;">${jamRange}</div>
      </td>
    </tr>
  </table>

  <!-- DI SISTEM -->
  <div style="padding:6px 16px 2px;font-size:6.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">DI SISTEM</div>
  <div style="height:1px;background:#e5e7eb;margin:0 16px;"></div>
  <table style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:2px 16px;font-size:7px;color:#6b7280;">Modal Kasir</td><td style="padding:2px 16px;text-align:right;font-size:7.5px;font-weight:700;color:#1f2937;">${fmtNb(startingCash)}</td></tr>
    <tr><td style="padding:2px 16px;font-size:7px;color:#6b7280;">Penjualan Tunai</td><td style="padding:2px 16px;text-align:right;font-size:7.5px;font-weight:700;color:#059669;">${fmtNb(cashRevenue)}</td></tr>
    <tr><td style="padding:2px 16px;font-size:7px;color:#6b7280;">Non-Tunai</td><td style="padding:2px 16px;text-align:right;font-size:7.5px;font-weight:700;color:#1f2937;">${fmtNb(totalNonTunai)}</td></tr>
    ${nonTunaiHtml}
    <tr><td style="padding:2px 16px;font-size:7px;color:#6b7280;">Pengeluaran</td><td style="padding:2px 16px;text-align:right;font-size:7.5px;font-weight:700;color:#dc2626;">${fmtNb(totalExpenses)}</td></tr>
    <tr><td style="padding:2px 16px;font-size:7px;color:#6b7280;">Item Terjual</td><td style="padding:2px 16px;text-align:right;font-size:7.5px;font-weight:700;color:#1f2937;">${totalItemsSold}</td></tr>
    ${totalDiscount > 0 ? `<tr><td style="padding:2px 16px;font-size:7px;color:#6b7280;">Diskon</td><td style="padding:2px 16px;text-align:right;font-size:7.5px;font-weight:700;color:#dc2626;">-${fmtNb(totalDiscount)}</td></tr>` : ""}
  </table>

  <div style="height:1px;background:#e5e7eb;margin:3px 16px;"></div>

  <!-- DI LACI -->
  <div style="padding:6px 16px 2px;font-size:6.5px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.5px;">DI LACI</div>
  <div style="height:1px;background:#e5e7eb;margin:0 16px;"></div>
  <table style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:2px 16px;font-size:7px;color:#6b7280;">Modal Kasir</td><td style="padding:2px 16px;text-align:right;font-size:7.5px;font-weight:700;color:#1f2937;">${fmtNb(startingCash)}</td></tr>
  </table>
  ${pecahanHtml}

  <div style="height:1px;background:#e5e7eb;margin:6px 16px;"></div>

  <!-- SELISIH -->
  <div style="padding:6px 16px 2px;font-size:6.5px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.5px;">SELISIH</div>
  <div style="height:1px;background:#e5e7eb;margin:0 16px;"></div>
  <table style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:2px 16px;font-size:7px;color:#6b7280;">Penjualan Tunai</td><td style="padding:2px 16px;text-align:right;font-size:7.5px;font-weight:700;color:#1f2937;">${fmtNb(cashRevenue)}</td></tr>
    <tr><td style="padding:2px 16px;font-size:7px;color:#6b7280;">Uang Fisik</td><td style="padding:2px 16px;text-align:right;font-size:7.5px;font-weight:700;color:#059669;">${fmtNb(cashInRegister)}</td></tr>
  </table>
  <div style="margin:4px 16px;padding:4px 8px;background:${selisihBg};border-radius:4px;display:flex;justify-content:space-between;">
    <span style="font-size:8px;font-weight:700;color:${selisihColor};">Selisih</span>
    <span style="font-size:9px;font-weight:800;color:${selisihColor};">${selisihTxt}</span>
  </div>

  ${notes ? `<div style="font-size:6.5px;color:#6b7280;font-style:italic;padding:4px 16px;">Catatan: ${notes}</div>` : ""}

  <!-- FOOTER -->
  <div style="padding:8px 16px 4px;text-align:center;font-size:6px;color:#9ca3af;">
    Djiwa Tentram · Kopi &amp; Eatery · ${tgl}
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
  container.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:380px;";
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#f1f5f9",
      width: 380,
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdfH = canvas.height * 0.48;
    const pdf = new jsPDF({
      orientation: pdfH > 380 ? "portrait" : "portrait",
      unit: "px",
      format: [380, Math.max(pdfH, 220)],
    });

    pdf.addImage(imgData, "PNG", 0, 0, 380, pdfH);
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
