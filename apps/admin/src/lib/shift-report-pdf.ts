import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ShiftPDFData = {
  shiftName: string;
  cashierName: string;
  teamMembers: string;
  teamFormatted?: string;
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
  return `Rp ${s}`;
}

function fmtShort(n: number): string {
  if (n >= 1000000) return `Rp${(n / 1000000).toFixed(1)}jt`;
  if (n >= 1000) return `Rp${(n / 1000).toFixed(0)}rb`;
  return fmtNb(n);
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
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function fmtDayName(ms: number): string {
  return new Date(ms).toLocaleDateString("id-ID", { weekday: "long" });
}

// ─── SVG Bar Chart Generator ────────────────────────────────────────────────

function buildChartSVG(
  items: { label: string; value: number; color: string }[],
  maxVal: number,
): string {
  if (!maxVal || items.length === 0) return "";
  const barH = 14;
  const labelW = 70;
  const barMaxW = 200;
  const gap = 2;
  const totalH = items.length * (barH + gap) + 4;

  const bars = items.map((item, i) => {
    const pct = item.value / maxVal;
    const bw = Math.max(pct * barMaxW, 10);
    const y = 2 + i * (barH + gap);
    return `
      <text x="2" y="${y + 9}" font-size="6.5" fill="#6b7280" font-family="sans-serif">${item.label}</text>
      <rect x="${labelW}" y="${y}" width="${bw}" height="${barH}" rx="3" fill="${item.color}" opacity="0.85"/>
      <text x="${labelW + bw + 4}" y="${y + 9}" font-size="7" font-weight="700" fill="#1f2937" font-family="sans-serif">${fmtNb(item.value)}</text>
    `;
  });

  return `
  <svg width="${labelW + barMaxW + 60}" height="${totalH}" xmlns="http://www.w3.org/2000/svg">
    ${bars.join("")}
  </svg>`;
}

// ─── HTML builder – Complete & Professional ──────────────────────────────────

export function buildReportHTML(data: ShiftPDFData, logoBase64: string): string {
  const {
    shiftName, cashierName, teamMembers, teamFormatted, startingCash, cashRevenue,
    paymentBreakdown, totalExpenses, totalItemsSold, totalDiscount,
    cashInRegister, cashBreakdown, notes, startTime, endTime,
  } = data;

  // ── Revenue Breakdown ──
  const pb = paymentBreakdown || {};
  const chartItems: { label: string; value: number; color: string }[] = [];

  if (cashRevenue > 0) chartItems.push({ label: "Tunai", value: cashRevenue, color: "#059669" });

  const ntItems: { label: string; value: number }[] = [];
  if (pb.qris) ntItems.push({ label: "QRIS", value: pb.qris });
  if ((pb.debit || 0) + (pb.credit || 0) > 0)
    ntItems.push({ label: "EDC", value: (pb.debit || 0) + (pb.credit || 0) });
  const ofp = pb.onlineFoodPlatforms || {};
  const pfLabels: Record<string, string> = { grab: "GrabFood", gofood: "GoFood", maxim: "Maxim", shopeefood: "ShopeeFood" };
  Object.entries(ofp).filter(([_, v]) => Number(v) > 0).forEach(([p, v]) => ntItems.push({ label: pfLabels[p] || p, value: Number(v) }));
  if (pb.transfer) ntItems.push({ label: "Transfer", value: pb.transfer });

  // Colors cycle for chart
  const colors = ["#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899"];
  ntItems.forEach((item, i) => {
    chartItems.push({ ...item, color: colors[i % colors.length] });
  });

  const maxVal = Math.max(...chartItems.map(i => i.value), 1);

  // ── Non-Tunai Detail ──
  const nonTunaiRows = ntItems;
  const totalNonTunai = nonTunaiRows.reduce((s, r) => s + r.value, 0);
  const totalPenjualan = cashRevenue + totalNonTunai;
  const netIncome = totalPenjualan - totalExpenses;
  const totalModal = startingCash;

  // ── Selisih ──
  const selisih = cashInRegister - cashRevenue;
  const selisihUp = selisih >= 0;
  const selisihAbs = Math.abs(Math.round(selisih));
  const selisihFmt = `Rp ${fmtRibuan(selisihAbs)}`;

  // ── Pecahan ──
  const pecahanEntries = Object.entries(cashBreakdown)
    .filter(([_, c]) => Number(c) > 0)
    .sort(([a], [b]) => Number(b.replace("bill", "")) - Number(a.replace("bill", "")));
  const totalPecahan = pecahanEntries.reduce((sum, [k, c]) => sum + Number(k.replace("bill", "")) * Number(c), 0);

  // ── Dates ──
  const tgl = fmtDate(startTime);
  const dayName = fmtDayName(startTime);
  const mulai = fmtTime(startTime);
  const selesai = endTime ? fmtTime(endTime) : "-";
  const jamRange = `${mulai} - ${selesai} WIB`;

  // ── Team members with roles ──
  let teamHtml = "";
  if (teamFormatted) {
    // Parse role-formatted: "Barista: Alice, Bob\nKitchen: Charlie"
    const roleLines = teamFormatted.split("\n");
    teamHtml = roleLines.map(line => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (trimmed.includes(":")) {
        const [role, ...rest] = trimmed.split(":");
        const names = rest.join(":").trim();
        return `<div style="display:flex;align-items:baseline;gap:4px;margin-bottom:2px;">
          <span style="font-size:7px;font-weight:700;color:#059669;min-width:52px;">${role.trim()}</span>
          <span style="font-size:7px;color:#374151;">${names}</span>
        </div>`;
      }
      return `<div style="font-size:7px;color:#374151;padding-left:56px;">${trimmed}</div>`;
    }).join("");
  } else if (teamMembers) {
    const arr = teamMembers.split(",").map(s => s.trim()).filter(Boolean);
    teamHtml = arr.map(name =>
      `<div style="font-size:7px;color:#374151;padding:1px 0;">${name}</div>`
    ).join("");
  } else {
    teamHtml = '<div style="font-size:7px;color:#9ca3af;">-</div>';
  }

  // ── Chart ──
  const chartHtml = buildChartSVG(chartItems, maxVal);

  // ── Styles ──
  const S = {
    page: "width:400px;background:#fff;margin:0 auto;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:0 0 12px 0;",
    hdrBg: "linear-gradient(135deg,#059669,#10b981)",
    secTxt: "font-size:7px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.2px;",
    secGreen: "font-size:7px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:1.2px;",
    sep: "height:1px;background:#e5e7eb;margin:0 16px;",
    lbl: "font-size:7px;color:#6b7280;",
    val: "font-size:8px;font-weight:700;color:#1f2937;",
    valG: "font-size:8px;font-weight:700;color:#059669;",
    valR: "font-size:8px;font-weight:700;color:#dc2626;",
    cellL: "padding:2px 16px;",
    cellR: "padding:2px 16px;text-align:right;",
  };

  // Helper untuk satu baris label-value
  const row = (label: string, value: string, valStyle = S.val) =>
    `<tr><td style="${S.cellL}${S.lbl}">${label}</td><td style="${S.cellR}${valStyle}">${value}</td></tr>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<div style="${S.page}">

  <!-- ═══ HEADER ═══ -->
  <div style="background:${S.hdrBg};padding:10px 16px;display:flex;align-items:center;gap:10px;">
    ${logoBase64
      ? `<img src="${logoBase64}" style="width:26px;height:26px;border-radius:6px;" />`
      : `<div style="width:26px;height:26px;border-radius:6px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#059669;">DT</div>`
    }
    <div style="flex:1;">
      <div style="font-size:14px;font-weight:800;color:#fff;">Djiwa Tentram</div>
      <div style="font-size:6.5px;color:rgba(255,255,255,0.7);">Kopi & Eatery</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:11px;font-weight:800;color:#fff;">LAPORAN SHIFT</div>
      <div style="font-size:6px;color:rgba(255,255,255,0.7);">${tgl}</div>
    </div>
  </div>

  <!-- ═══ INFO BADGES ═══ -->
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
    <tr>
      <td style="width:25%;border:1px solid #e5e7eb;padding:5px 4px;text-align:center;">
        <div style="font-size:5.5px;color:#9ca3af;">Kasir</div>
        <div style="font-size:7.5px;font-weight:700;color:#1f2937;">${cashierName}</div>
      </td>
      <td style="width:25%;border:1px solid #e5e7eb;padding:5px 4px;text-align:center;">
        <div style="font-size:5.5px;color:#9ca3af;">Shift</div>
        <div style="font-size:7.5px;font-weight:700;color:#1f2937;">${shiftName}</div>
      </td>
      <td style="width:25%;border:1px solid #e5e7eb;padding:5px 4px;text-align:center;">
        <div style="font-size:5.5px;color:#9ca3af;">Jam</div>
        <div style="font-size:7.5px;font-weight:700;color:#1f2937;">${jamRange}</div>
      </td>
      <td style="width:25%;border:1px solid #e5e7eb;padding:5px 4px;text-align:center;">
        <div style="font-size:5.5px;color:#9ca3af;">Hari</div>
        <div style="font-size:7.5px;font-weight:700;color:#1f2937;">${dayName}</div>
      </td>
    </tr>
  </table>

  <!-- ═══ TIM BERTUGAS ═══ -->
  <div style="padding:8px 16px 3px;">
    <div style="${S.secTxt}">Tim Bertugas</div>
  </div>
  <div style="${S.sep}"></div>
  <div style="padding:6px 16px;">
    ${teamHtml}
  </div>

  <!-- ═══ CHART ═══ -->
  <div style="padding:8px 16px 3px;">
    <div style="${S.secTxt}">Grafik Pendapatan</div>
  </div>
  <div style="padding:4px 16px;">
    ${chartHtml}
  </div>

  <!-- ═══ DI SISTEM ═══ -->
  <div style="padding:8px 16px 3px;margin-top:2px;">
    <div style="${S.secTxt}">Ringkasan Sistem</div>
  </div>
  <div style="${S.sep}"></div>
  <table style="width:100%;border-collapse:collapse;">
    ${row("Modal Kasir", fmtNb(startingCash))}
    ${row("Penjualan Tunai", fmtNb(cashRevenue), S.valG)}
    ${row("Non-Tunai", fmtNb(totalNonTunai))}
    ${nonTunaiRows.map(r =>
      `<tr><td style="padding:1.5px 28px;font-size:6.5px;color:#9ca3af;">${r.label}</td><td style="padding:1.5px 16px;text-align:right;font-size:7px;font-weight:600;color:#6b7280;">${fmtNb(r.value)}</td></tr>`
    ).join("")}
    <tr><td style="padding:3px 16px;font-size:7px;font-weight:700;color:#1f2937;border-top:1px dashed #e5e7eb;">Total Penjualan</td>
      <td style="padding:3px 16px;text-align:right;border-top:1px dashed #e5e7eb;font-size:9px;font-weight:800;color:#059669;">${fmtNb(totalPenjualan)}</td></tr>
    ${row("Pengeluaran", fmtNb(totalExpenses), S.valR)}
    ${totalDiscount > 0 ? row("Diskon", `-${fmtNb(totalDiscount)}`, S.valR) : ""}
    ${row("Item Terjual", `${totalItemsSold}`)}
    <tr><td style="padding:3px 16px;font-size:7px;font-weight:700;color:#1f2937;border-top:1px dashed #e5e7eb;">Pendapatan Bersih</td>
      <td style="padding:3px 16px;text-align:right;border-top:1px dashed #e5e7eb;font-size:9px;font-weight:800;${netIncome >= 0 ? 'color:#059669;' : 'color:#dc2626;'}">${netIncome >= 0 ? '' : '-'}${fmtNb(Math.abs(netIncome))}</td></tr>
  </table>

  <!-- ═══ DI LACI ═══ -->
  <div style="padding:8px 16px 3px;">
    <div style="${S.secGreen}">Rekonsiliasi Laci</div>
  </div>
  <div style="${S.sep}"></div>
  <table style="width:100%;border-collapse:collapse;">
    ${row("Modal Kasir", fmtNb(startingCash))}
    ${row("Penjualan Tunai", fmtNb(cashRevenue), S.valG)}
    ${row("Non-Tunai", fmtNb(totalNonTunai))}
  </table>

  <!-- Pecahan -->
  <div style="padding:4px 16px 2px;">
    <div style="font-size:7px;font-weight:700;color:#059669;">Pecahan Uang</div>
  </div>
  ${pecahanEntries.length ? pecahanEntries.map(([k, c]) => {
    const nominal = Number(k.replace("bill", ""));
    return `<div style="display:flex;justify-content:space-between;padding:1px 16px;">
      <span style="font-size:6.5px;color:#6b7280;min-width:60px;">${fmtNb(nominal)}</span>
      <span style="font-size:6.5px;color:#9ca3af;">× ${c}</span>
      <span style="font-size:7px;font-weight:700;color:#1f2937;">= ${fmtNb(nominal * Number(c))}</span>
    </div>`;
  }).join("")
  : '<div style="padding:1px 16px;font-size:6.5px;color:#9ca3af;">(tidak diisi)</div>'}

  <!-- Total Laci -->
  <div style="margin:4px 16px 0;padding:4px 12px;background:#f0fdf4;border-radius:4px;display:flex;justify-content:space-between;">
    <span style="font-size:8px;font-weight:700;color:#059669;">Total Uang Fisik</span>
    <span style="font-size:9px;font-weight:800;color:#059669;">${fmtNb(totalPecahan || cashInRegister)}</span>
  </div>

  <div style="${S.sep};margin:8px 16px;"></div>

  <!-- ═══ SELISIH ═══ -->
  <div style="padding:4px 16px 3px;">
    <div style="${S.secGreen}">Selisih</div>
  </div>
  <div style="${S.sep}"></div>
  <table style="width:100%;border-collapse:collapse;">
    ${row("Penjualan Tunai", fmtNb(cashRevenue))}
    ${row("Uang Fisik", fmtNb(cashInRegister), S.valG)}
  </table>
  <div style="margin:4px 16px;padding:5px 12px;background:${selisih >= 0 ? '#f0fdf4' : '#fef2f2'};border-radius:5px;display:flex;justify-content:space-between;">
    <span style="font-size:9px;font-weight:700;color:${selisih >= 0 ? '#059669' : '#dc2626'};">Selisih</span>
    <span style="font-size:10px;font-weight:800;color:${selisih >= 0 ? '#059669' : '#dc2626'};">${selisih === 0 ? 'Rp 0' : `${selisihUp ? '⬆ Naik' : '⬇ Turun'} ${selisihFmt}`}</span>
  </div>

  ${notes ? `<div style="padding:4px 16px;font-size:6.5px;color:#6b7280;font-style:italic;">Catatan: ${notes}</div>` : ""}

  <!-- ═══ FOOTER ═══ -->
  <div style="padding:8px 16px 4px;text-align:center;font-size:6px;color:#9ca3af;">
    Djiwa Tentram · Kopi & Eatery · ${tgl}
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
  container.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:400px;";
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#f1f5f9",
      width: 400,
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdfH = canvas.height * 0.46;
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "px",
      format: [400, Math.max(pdfH, 240)],
    });

    pdf.addImage(imgData, "PNG", 0, 0, 400, pdfH);
    return pdf.output("blob");
  } finally {
    document.body.removeChild(container);
  }
}

export async function loadLogoBase64(): Promise<string> {
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
