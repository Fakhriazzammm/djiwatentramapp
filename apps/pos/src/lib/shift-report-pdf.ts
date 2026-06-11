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

// ─── Logo loader ─────────────────────────────────────────────────────────────

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

// ─── HTML builder ────────────────────────────────────────────────────────────

function buildReportHTML(data: ShiftPDFData, logoBase64: string): string {
  const {
    shiftName, cashierName, startingCash, cashRevenue,
    paymentBreakdown, totalExpenses, totalItemsSold,
    cashInRegister, cashBreakdown, notes,
  } = data;

  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" alt="logo" style="width:36px;height:36px;border-radius:8px;" />`
    : `<div style="width:36px;height:36px;border-radius:8px;background:#059669;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;">DT</div>`;

  // ── Badge warna shift ──
  const shiftColors: Record<string, string> = { pagi: "#f59e0b", siang: "#10b981", sore: "#3b82f6", malam: "#8b5cf6" };
  const shiftBg = shiftColors[shiftName.toLowerCase()] || "#6b7280";

  // ── Non-tunai breakdown ──
  const pb = paymentBreakdown || {};
  const nonTunaiRows: { label: string; value: number }[] = [];
  if (pb.qris) nonTunaiRows.push({ label: "QRIS", value: pb.qris });
  if ((pb.debit || 0) + (pb.credit || 0) > 0) nonTunaiRows.push({ label: "EDC", value: (pb.debit || 0) + (pb.credit || 0) });
  const ofp = pb.onlineFoodPlatforms || {};
  const platformLabels: Record<string, string> = { grab: "GrabFood", gofood: "GoFood", maxim: "Maxim", shopeefood: "ShopeeFood" };
  Object.entries(ofp).filter(([_, v]) => Number(v) > 0).forEach(([p, v]) => nonTunaiRows.push({ label: platformLabels[p] || p, value: Number(v) }));
  if (pb.transfer) nonTunaiRows.push({ label: "Transfer", value: pb.transfer });

  const totalNonTunai = nonTunaiRows.reduce((s, r) => s + r.value, 0);
  const totalPenjualan = cashRevenue + totalNonTunai;
  const maxBar = Math.max(cashRevenue, totalNonTunai, 1);
  const selisih = cashInRegister - cashRevenue;
  const selisihColor = selisih >= 0 ? "#10b981" : "#ef4444";
  const selisihLabel = selisih === 0 ? "Pas" : selisih > 0 ? `Lebih ${fmtRibuan(selisih)}` : `Kurang ${fmtRibuan(Math.abs(selisih))}`;

  // ── Pecahan ──
  const pecahanEntries = Object.entries(cashBreakdown)
    .filter(([_, c]) => Number(c) > 0)
    .sort(([a], [b]) => Number(b.replace("bill", "")) - Number(a.replace("bill", "")));

  const now = new Date();
  const timestamp = now.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  const jam = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6;">
  <div style="width:360px;background:#ffffff;margin:0 auto;overflow:hidden;">

    <!-- ─── HEADER ─── -->
    <div style="display:flex;align-items:center;gap:10px;padding:12px;border-bottom:1.5px solid #f3f4f6;">
      ${logoHtml}
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:800;color:#111;">Laporan Shift</div>
        <div style="display:inline-block;margin-top:2px;padding:1px 8px;border-radius:999px;background:${shiftBg};color:#fff;font-size:9px;font-weight:700;text-transform:capitalize;">${shiftName}</div>
      </div>
      <div style="text-align:right;font-size:8px;color:#9ca3af;white-space:nowrap;">
        ${timestamp}<br>${jam} WIB
      </div>
    </div>

    <!-- ─── INFO GRID ─── -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:10px 12px;border-bottom:1px solid #e5e7eb;">
      <div style="background:#f9fafb;border-radius:6px;padding:6px 8px;">
        <div style="font-size:7px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.3px;">Kasir</div>
        <div style="font-size:11px;font-weight:700;color:#111;margin-top:1px;white-space:nowrap;">${cashierName}</div>
      </div>
      <div style="background:#f9fafb;border-radius:6px;padding:6px 8px;text-align:right;">
        <div style="font-size:7px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.3px;">Modal Kasir</div>
        <div style="font-size:11px;font-weight:700;color:#111;margin-top:1px;white-space:nowrap;">${fmtNb(startingCash)}</div>
      </div>
    </div>

    <!-- ─── SUMMARY BADGES ─── -->
    <div style="display:flex;gap:4px;padding:8px 12px;border-bottom:1px solid #e5e7eb;">
      <div style="flex:1;background:#f0fdf4;border-radius:8px;padding:6px 2px;text-align:center;">
        <div style="font-size:11px;font-weight:800;color:#059669;white-space:nowrap;">${fmtNb(totalPenjualan)}</div>
        <div style="font-size:6px;font-weight:600;color:#6b7280;text-transform:uppercase;margin-top:1px;">Total Penjualan</div>
      </div>
      <div style="flex:1;background:#eff6ff;border-radius:8px;padding:6px 2px;text-align:center;">
        <div style="font-size:11px;font-weight:800;color:#2563eb;">${totalItemsSold}</div>
        <div style="font-size:6px;font-weight:600;color:#6b7280;text-transform:uppercase;margin-top:1px;">Item Terjual</div>
      </div>
      <div style="flex:1;background:#fef2f2;border-radius:8px;padding:6px 2px;text-align:center;">
        <div style="font-size:11px;font-weight:800;color:#dc2626;white-space:nowrap;">${fmtNb(totalExpenses)}</div>
        <div style="font-size:6px;font-weight:600;color:#6b7280;text-transform:uppercase;margin-top:1px;">Pengeluaran</div>
      </div>
    </div>

    <!-- ─── PENDAPATAN ─── -->
    <div style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:10px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px;">Pendapatan</div>
      <div style="display:flex;justify-content:space-between;padding:2px 0;font-size:10px;">
        <span style="font-weight:600;color:#374151;">Tunai</span>
        <span style="font-weight:700;color:#111;">${fmtNb(cashRevenue)}</span>
      </div>
      ${nonTunaiRows.map(r => `
      <div style="display:flex;justify-content:space-between;padding:2px 0 2px 12px;font-size:9px;">
        <span style="color:#4b5563;">${r.label}</span>
        <span style="font-weight:600;color:#374151;">${fmtNb(r.value)}</span>
      </div>`).join("")}
    </div>

    <!-- ─── DISTRIBUSI ─── -->
    <div style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:10px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px;">Distribusi</div>
      <div style="margin-bottom:4px;">
        <div style="display:flex;justify-content:space-between;font-size:8px;color:#6b7280;margin-bottom:1px;">
          <span>Tunai</span><span>${fmtRibuan(cashRevenue)}</span>
        </div>
        <div style="width:100%;height:6px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
          <div style="width:${(cashRevenue/maxBar)*100}%;height:100%;background:#059669;border-radius:4px;"></div>
        </div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;font-size:8px;color:#6b7280;margin-bottom:1px;">
          <span>Non Tunai</span><span>${fmtRibuan(totalNonTunai)}</span>
        </div>
        <div style="width:100%;height:6px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
          <div style="width:${(totalNonTunai/maxBar)*100}%;height:100%;background:#3b82f6;border-radius:4px;"></div>
        </div>
      </div>
    </div>

    <!-- ─── LACI ─── -->
    <div style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:10px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px;">Rekonsiliasi Laci</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;">
        <div style="background:#f9fafb;border-radius:6px;padding:6px;text-align:center;">
          <div style="font-size:7px;color:#9ca3af;">Modal</div>
          <div style="font-size:10px;font-weight:700;color:#111;margin-top:1px;">${fmtNb(startingCash)}</div>
        </div>
        <div style="background:#f9fafb;border-radius:6px;padding:6px;text-align:center;">
          <div style="font-size:7px;color:#9ca3af;">Uang Fisik</div>
          <div style="font-size:10px;font-weight:700;color:#111;margin-top:1px;">${fmtNb(cashInRegister)}</div>
        </div>
        <div style="background:#f9fafb;border-radius:6px;padding:6px;text-align:center;">
          <div style="font-size:7px;color:#9ca3af;">Selisih</div>
          <div style="font-size:10px;font-weight:700;color:${selisihColor};margin-top:1px;">${selisihLabel}</div>
        </div>
      </div>
    </div>

    <!-- ─── PECAHAN ─── -->
    ${pecahanEntries.length ? `
    <div style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:10px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px;">Pecahan Uang</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;">
        ${pecahanEntries.map(([key, count]) => {
          const nominal = Number(key.replace("bill", ""));
          return `<div style="display:flex;justify-content:space-between;font-size:8px;padding:3px 6px;background:#f9fafb;border-radius:4px;">
          <span style="font-weight:700;color:#374151;white-space:nowrap;">${fmtNb(nominal)}</span>
          <span style="font-weight:600;color:#6b7280;white-space:nowrap;">× ${count} = ${fmtNb(nominal * Number(count))}</span>
        </div>`;
        }).join("")}
        <div style="display:flex;justify-content:space-between;font-size:8px;padding:3px 6px;background:#f3f4f6;border-radius:4px;font-weight:700;grid-column:span 2;">
          <span style="color:#374151;">Total</span>
          <span style="color:#6b7280;">${fmtNb(cashInRegister)}</span>
        </div>
      </div>
    </div>` : ""}

    <!-- ─── FOOTER ─── -->
    <div style="padding:8px 12px 12px;">
      ${notes ? `<div style="font-size:8px;color:#6b7280;font-style:italic;margin-bottom:6px;">${notes}</div>` : ""}
      <div style="font-size:7px;color:#9ca3af;text-align:center;">Dicetak: ${timestamp} ${jam} WIB</div>
    </div>

  </div>
</body>
</html>`;
}

// ─── Generate PDF ────────────────────────────────────────────────────────────

export async function generateShiftReportPDF(data: ShiftPDFData): Promise<Blob> {
  const logoBase64 = await loadLogoBase64();
  const html = buildReportHTML(data, logoBase64);

  const container = document.createElement("div");
  container.innerHTML = html;
  container.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:360px;";
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: 360,
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "px",
      format: [360, canvas.height * 0.5],
    });

    pdf.addImage(imgData, "PNG", 0, 0, 360, canvas.height * 0.5);
    return pdf.output("blob");
  } finally {
    document.body.removeChild(container);
  }
}
