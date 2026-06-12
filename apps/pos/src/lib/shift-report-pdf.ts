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
    cashInRegister, cashBreakdown, notes, startTime, endTime,
  } = data;

  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" alt="logo" style="width:38px;height:38px;border-radius:10px;" />`
    : `<div style="width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;box-shadow:0 2px 8px rgba(5,150,105,0.3);">DT</div>`;

  // Shift badge colors
  const shiftColors: Record<string, string> = {
    pagi: "#f59e0b", siang: "#10b981", sore: "#3b82f6", malam: "#8b5cf6"
  };
  const shiftBg = shiftColors[shiftName.toLowerCase()] || "#6b7280";
  const shiftLabel = shiftName.charAt(0).toUpperCase() + shiftName.slice(1).toLowerCase();

  // Non-tunai breakdown
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
  const selisih = cashInRegister - cashRevenue;
  const selisihColor = selisih >= 0 ? "#059669" : "#dc2626";
  const selisihIcon = selisih === 0 ? "✓" : selisih > 0 ? "↑" : "↓";
  const selisihLabel = selisih === 0 ? "Pas" : selisih > 0 ? `Lebih ${fmtRibuan(selisih)}` : `Kurang ${fmtRibuan(Math.abs(selisih))}`;

  // Pecahan
  const pecahanEntries = Object.entries(cashBreakdown)
    .filter(([_, c]) => Number(c) > 0)
    .sort(([a], [b]) => Number(b.replace("bill", "")) - Number(a.replace("bill", "")));
  const totalPecahan = pecahanEntries.reduce((sum, [k, c]) => sum + Number(k.replace("bill", "")) * Number(c), 0);

  // Time range
  const tglStr = fmtDate(startTime);
  const jamMulai = fmtTime(startTime);
  const jamSelesai = endTime ? fmtTime(endTime) : "-";
  const now = new Date();
  const cetakTgl = now.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  const cetakJam = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  // Stats for bar chart
  const items = cashRevenue > 0 ? [
    { label: "Tunai", value: cashRevenue, color: "#059669", pct: Math.min(100, (cashRevenue / Math.max(totalPenjualan, 1)) * 100) },
    ...nonTunaiRows.map(r => ({ label: r.label, value: r.value, color: "#3b82f6", pct: Math.min(100, (r.value / Math.max(totalPenjualan, 1)) * 100) })),
  ] : [];

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;">
  <div style="width:360px;background:#fff;margin:0 auto;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

    <!-- ═══ HEADER ═══ -->
    <div style="background:linear-gradient(135deg,#059669,#10b981);padding:16px 14px;display:flex;align-items:center;gap:12px;">
      ${logoHtml}
      <div style="flex:1;">
        <div style="font-size:14px;font-weight:800;color:#fff;letter-spacing:0.3px;">Laporan Shift</div>
        <div style="font-size:9px;color:rgba(255,255,255,0.75);margin-top:2px;">${tglStr}</div>
      </div>
      <div style="text-align:right;">
        <span style="display:inline-block;padding:2px 10px;border-radius:999px;background:rgba(255,255,255,0.2);color:#fff;font-size:10px;font-weight:700;">${shiftLabel}</span>
      </div>
    </div>

    <!-- ═══ INFO GRID ═══ -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:#e5e7eb;">
      <div style="background:#fff;padding:10px 8px;text-align:center;">
        <div style="font-size:7px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Kasir</div>
        <div style="font-size:11px;font-weight:700;color:#111;margin-top:3px;">${cashierName}</div>
      </div>
      <div style="background:#fff;padding:10px 8px;text-align:center;">
        <div style="font-size:7px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Jam</div>
        <div style="font-size:11px;font-weight:700;color:#111;margin-top:3px;">${jamMulai} - ${jamSelesai}</div>
      </div>
      <div style="background:#fff;padding:10px 8px;text-align:center;">
        <div style="font-size:7px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Modal</div>
        <div style="font-size:11px;font-weight:700;color:#059669;margin-top:3px;">${fmtNb(startingCash)}</div>
      </div>
    </div>

    <!-- ═══ STATS CARDS ═══ -->
    <div style="display:flex;gap:6px;padding:10px 12px;">
      <div style="flex:1;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-radius:8px;padding:8px 6px;text-align:center;">
        <div style="font-size:7px;font-weight:600;color:#059669;text-transform:uppercase;letter-spacing:0.5px;">Penjualan</div>
        <div style="font-size:12px;font-weight:800;color:#059669;margin-top:4px;">${fmtNb(totalPenjualan)}</div>
      </div>
      <div style="flex:1;background:linear-gradient(135deg,#eff6ff,#dbeafe);border-radius:8px;padding:8px 6px;text-align:center;">
        <div style="font-size:7px;font-weight:600;color:#2563eb;text-transform:uppercase;letter-spacing:0.5px;">Item</div>
        <div style="font-size:12px;font-weight:800;color:#2563eb;margin-top:4px;">${totalItemsSold}</div>
      </div>
      <div style="flex:1;background:linear-gradient(135deg,#fef2f2,#fee2e2);border-radius:8px;padding:8px 6px;text-align:center;">
        <div style="font-size:7px;font-weight:600;color:#dc2626;text-transform:uppercase;letter-spacing:0.5px;">Biaya</div>
        <div style="font-size:12px;font-weight:800;color:#dc2626;margin-top:4px;">${fmtNb(totalExpenses)}</div>
      </div>
    </div>

    <!-- ═══ PENDAPATAN ═══ -->
    <div style="padding:8px 12px 10px;">
      <div style="font-size:9px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
        <span style="display:inline-block;width:3px;height:12px;background:#059669;border-radius:2px;"></span>
        PENDAPATAN
      </div>
      ${cashRevenue > 0 ? `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#059669;"></span>
          <span style="font-size:9px;font-weight:600;color:#374151;">Tunai</span>
        </div>
        <span style="font-size:10px;font-weight:700;color:#111;">${fmtNb(cashRevenue)}</span>
      </div>` : ""}
      ${nonTunaiRows.map((r, i) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0 4px 14px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:4px;height:4px;border-radius:50%;background:#3b82f6;"></span>
          <span style="font-size:8px;color:#4b5563;">${r.label}</span>
        </div>
        <span style="font-size:9px;font-weight:600;color:#374151;">${fmtNb(r.value)}</span>
      </div>`).join("")}
      ${totalDiscount > 0 ? `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-top:1px dashed #e5e7eb;margin-top:2px;">
        <span style="font-size:8px;color:#9ca3af;">Diskon</span>
        <span style="font-size:9px;font-weight:600;color:#dc2626;">−${fmtNb(totalDiscount)}</span>
      </div>` : ""}
    </div>

    <!-- ═══ DISTRIBUSI (Bar Chart) ═══ -->
    ${items.length > 0 ? `
    <div style="padding:6px 12px 10px;border-top:1px solid #f3f4f6;">
      <div style="font-size:9px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
        <span style="display:inline-block;width:3px;height:12px;background:#3b82f6;border-radius:2px;"></span>
        DISTRIBUSI
      </div>
      ${items.map(item => `
      <div style="margin-bottom:5px;">
        <div style="display:flex;justify-content:space-between;font-size:8px;color:#6b7280;margin-bottom:2px;">
          <span style="font-weight:600;">${item.label}</span>
          <span style="font-weight:700;">${fmtRibuan(item.value)}</span>
        </div>
        <div style="width:100%;height:5px;background:#f3f4f6;border-radius:3px;overflow:hidden;">
          <div style="width:${item.pct}%;height:100%;background:${item.color};border-radius:3px;transition:width 0.3s;"></div>
        </div>
      </div>`).join("")}
    </div>` : ""}

    <!-- ═══ REKONSILIASI LACI ═══ -->
    <div style="padding:8px 12px 10px;border-top:1px solid #f3f4f6;">
      <div style="font-size:9px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
        <span style="display:inline-block;width:3px;height:12px;background:#f59e0b;border-radius:2px;"></span>
        REKONSILIASI LACI
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
        <div style="background:#f9fafb;border-radius:8px;padding:8px 6px;text-align:center;border:1px solid #f3f4f6;">
          <div style="font-size:7px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.3px;">Modal</div>
          <div style="font-size:11px;font-weight:800;color:#111;margin-top:4px;">${fmtNb(startingCash)}</div>
        </div>
        <div style="background:#f9fafb;border-radius:8px;padding:8px 6px;text-align:center;border:1px solid #f3f4f6;">
          <div style="font-size:7px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.3px;">Uang Fisik</div>
          <div style="font-size:11px;font-weight:800;color:#111;margin-top:4px;">${fmtNb(cashInRegister)}</div>
        </div>
        <div style="background:${selisih >= 0 ? '#f0fdf4' : '#fef2f2'};border-radius:8px;padding:8px 6px;text-align:center;border:1px solid ${selisih >= 0 ? '#bbf7d0' : '#fecaca'};">
          <div style="font-size:7px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.3px;">Selisih</div>
          <div style="font-size:11px;font-weight:800;color:${selisihColor};margin-top:4px;">${selisihIcon} ${selisihLabel}</div>
        </div>
      </div>
    </div>

    <!-- ═══ PECAHAN ═══ -->
    ${pecahanEntries.length ? `
    <div style="padding:8px 12px 10px;border-top:1px solid #f3f4f6;">
      <div style="font-size:9px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
        <span style="display:inline-block;width:3px;height:12px;background:#8b5cf6;border-radius:2px;"></span>
        PECAHAN UANG
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;">
        ${pecahanEntries.map(([key, count]) => {
          const nominal = Number(key.replace("bill", ""));
          return `<div style="display:flex;justify-content:space-between;font-size:8px;padding:3px 8px;background:#f9fafb;border-radius:4px;">
            <span style="font-weight:700;color:#374151;">${fmtNb(nominal)}</span>
            <span style="color:#6b7280;">× ${count} = <strong style="color:#374151;">${fmtNb(nominal * Number(count))}</strong></span>
          </div>`;
        }).join("")}
        <div style="display:flex;justify-content:space-between;font-size:8px;padding:4px 8px;background:#f3f4f6;border-radius:4px;font-weight:700;grid-column:span 2;">
          <span style="color:#374151;">Total Uang Fisik</span>
          <span style="color:#059669;">${fmtNb(totalPecahan)}</span>
        </div>
      </div>
    </div>` : ""}

    <!-- ═══ DISKON ═══ -->
    ${totalDiscount > 0 ? `
    <div style="padding:6px 12px;border-top:1px solid #f3f4f6;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:8px;color:#6b7280;font-weight:600;">Total Diskon</span>
      <span style="font-size:10px;font-weight:700;color:#dc2626;">−${fmtNb(totalDiscount)}</span>
    </div>` : ""}

    <!-- ═══ FOOTER ═══ -->
    <div style="padding:8px 12px 12px;border-top:1px solid #f3f4f6;">
      ${notes ? `<div style="font-size:8px;color:#6b7280;font-style:italic;margin-bottom:6px;padding:6px 8px;background:#f9fafb;border-radius:4px;">📝 ${notes}</div>` : ""}
      <div style="font-size:7px;color:#9ca3af;text-align:center;padding-top:4px;">
        Dicetak: ${cetakTgl} ${cetakJam} WIB &middot; Djiwa Tentram &middot; Kopi & Eatery
      </div>
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
      backgroundColor: "#f1f5f9",
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
