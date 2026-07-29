import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Download, Image as ImageIcon, FileText } from "lucide-react";
import { toast } from "sonner";
import type { SchedulesByDate } from "@/hooks/use-hybrid-attendance-schedules";
import type { ShiftSchedule } from "@/lib/attendance-schedule-import";
import { exportRosterXlsx, exportFlatXlsx } from "@/lib/attendance-schedule-export";
import { buildShiftResolver, generateMonthDateRows } from "@/lib/attendance-import-template";
import { getDay } from "date-fns";

type ExportFormat = "matrix" | "flat" | "pdf" | "png";

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];
const FULL_DAY_NAMES = ["MINGGU", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"];

type ExportDialogProps = {
  open: boolean;
  onClose: () => void;
  schedulesByDate: SchedulesByDate | null;
  month: number;
  year: number;
  shiftTemplates: ShiftSchedule[];
};

export default function AttendanceExportDialog({
  open,
  onClose,
  schedulesByDate,
  month,
  year,
  shiftTemplates,
}: ExportDialogProps) {
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("matrix");
  const [includeOff, setIncludeOff] = useState(false);
  const [includeGeneral, setIncludeGeneral] = useState(true);

  // ── Build HTML table from schedules ───────────────────────────
  function buildHtmlTable(): HTMLTableElement {
    const resolver = buildShiftResolver(shiftTemplates);
    const dateRows = generateMonthDateRows(month, year);

    // Collect unique staff
    const staffMap = new Map<string, { name: string; role: string }>();
    let order = 0;
    if (schedulesByDate) {
      for (const schedules of Object.values(schedulesByDate)) {
        for (const s of schedules) {
          if (!staffMap.has(s.userId)) {
            staffMap.set(s.userId, { name: s.userName, role: s.roleName });
          }
        }
      }
    }
    const staff = Array.from(staffMap.entries());

    // Build schedule lookup: date -> userId -> schedule
    const scheduleMap = new Map<string, Map<string, any>>();
    if (schedulesByDate) {
      for (const [dateStr, schedules] of Object.entries(schedulesByDate)) {
        for (const s of schedules) {
          if (!scheduleMap.has(dateStr)) scheduleMap.set(dateStr, new Map());
          scheduleMap.get(dateStr)!.set(s.userId, s);
        }
      }
    }

    const table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    table.style.width = "100%";
    table.style.fontFamily = "Calibri, sans-serif";
    table.style.fontSize = "10px";

    // Header row 1: title + groups
    const h1 = table.createTHead().insertRow();
    const titleCell = h1.insertCell();
    titleCell.colSpan = 3 + staff.length;
    titleCell.textContent = `JADWAL ${MONTH_NAMES[month - 1].toUpperCase()} ${year}`;
    titleCell.style.textAlign = "center";
    titleCell.style.fontWeight = "bold";
    titleCell.style.fontSize = "14px";
    titleCell.style.backgroundColor = "#C6EFCE";
    titleCell.style.color = "#006100";
    titleCell.style.border = "1px solid #808080";

    // Header row 2: MINGGU KE, HARI, TANGGAL, roles
    const h2 = table.createTHead().insertRow();
    ["MINGGU KE", "HARI", "TANGGAL"].forEach((h) => {
      const c = h2.insertCell();
      c.textContent = h;
      c.style.fontWeight = "bold";
      c.style.textAlign = "center";
      c.style.border = "1px solid #808080";
      c.style.backgroundColor = "#F2F2F2";
    });
    for (const [, s] of staff) {
      const c = h2.insertCell();
      c.textContent = s.role;
      c.style.fontWeight = "bold";
      c.style.textAlign = "center";
      c.style.border = "1px solid #808080";
    }

    // Data rows
    for (const dr of dateRows) {
      const row = table.insertRow();
      const d = new Date(dr.dateStr + "T00:00:00");

      const weekCell = row.insertCell();
      weekCell.textContent = dr.weekLabel;
      weekCell.style.border = "1px solid #808080";
      weekCell.style.textAlign = "center";

      const dayCell = row.insertCell();
      dayCell.textContent = FULL_DAY_NAMES[getDay(d)];
      dayCell.style.border = "1px solid #808080";
      dayCell.style.textAlign = "center";

      const dateCell = row.insertCell();
      dateCell.textContent = dr.dateStr;
      dateCell.style.border = "1px solid #808080";
      dateCell.style.textAlign = "center";

      for (const [userId, s] of staff) {
        const cell = row.insertCell();
        cell.style.border = "1px solid #808080";
        cell.style.textAlign = "center";
        cell.style.padding = "2px 4px";

        const rowSchedule = scheduleMap.get(dr.dateStr);
        const schedule = rowSchedule?.get(userId);

        if (schedule) {
          const isOff = schedule.shiftName === "OFF";
          const isGeneral = schedule.shiftName === "GENERAL";

          if (isOff && !includeOff) {
            cell.textContent = "";
          } else if (isGeneral && !includeGeneral) {
            cell.textContent = "";
          } else if (isOff) {
            cell.textContent = "OFF";
            cell.style.backgroundColor = "#FFC7CE";
            cell.style.color = "#9C0006";
            cell.style.fontWeight = "bold";
          } else if (isGeneral) {
            cell.textContent = "GENERAL";
            cell.style.backgroundColor = "#D9D9D9";
            cell.style.color = "#595959";
          } else {
            const times = resolver.getShiftTimes(schedule.shiftName);
            const start = resolver.formatDisplayTime(times.openTime || schedule.startTime);
            const end = resolver.formatDisplayTime(times.closeTime || schedule.endTime);
            cell.textContent = `${schedule.shiftName}${start ? ` (${start} - ${end})` : ""}`;

            const nameUpper = schedule.shiftName.toUpperCase();
            if (nameUpper.includes("PAGI")) {
              cell.style.backgroundColor = "#C6EFCE";
              cell.style.color = "#006100";
            } else if (nameUpper.includes("SORE")) {
              cell.style.backgroundColor = "#BDD7EE";
              cell.style.color = "#1F4E79";
            }
          }
        }
      }
    }

    return table;
  }

  // ── PDF export ────────────────────────────────────────────────
  async function handleExportPdf() {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF("landscape", "mm", "a4");
    const title = `JADWAL ${MONTH_NAMES[month - 1].toUpperCase()} ${year}`;

    doc.setFontSize(14);
    doc.text(title, doc.internal.pageSize.getWidth() / 2, 15, { align: "center" });

    // Build table data
    const staffMap = new Map<string, { name: string; role: string }>();
    if (schedulesByDate) {
      for (const schedules of Object.values(schedulesByDate)) {
        for (const s of schedules) {
          if (!staffMap.has(s.userId)) staffMap.set(s.userId, { name: s.userName, role: s.roleName });
        }
      }
    }
    const staffEntries = Array.from(staffMap.entries());
    const resolver = buildShiftResolver(shiftTemplates);
    const dateRows = generateMonthDateRows(month, year);

    const scheduleMap = new Map<string, Map<string, any>>();
    if (schedulesByDate) {
      for (const [dateStr, schedules] of Object.entries(schedulesByDate)) {
        for (const s of schedules) {
          if (!scheduleMap.has(dateStr)) scheduleMap.set(dateStr, new Map());
          scheduleMap.get(dateStr)!.set(s.userId, s);
        }
      }
    }

    const headers = ["Minggu Ke", "Hari", "Tanggal", ...staffEntries.map(([, s]) => s.role)];
    const bodyRows: string[][] = [];

    for (const dr of dateRows) {
      const d = new Date(dr.dateStr + "T00:00:00");
      const row = [dr.weekLabel, FULL_DAY_NAMES[getDay(d)], dr.dateStr];

      for (const [userId] of staffEntries) {
        const rs = scheduleMap.get(dr.dateStr);
        const schedule = rs?.get(userId);
        if (!schedule) { row.push(""); continue; }
        if (schedule.shiftName === "OFF" && !includeOff) { row.push(""); continue; }
        if (schedule.shiftName === "GENERAL" && !includeGeneral) { row.push(""); continue; }
        if (schedule.shiftName === "OFF") { row.push("OFF"); continue; }
        if (schedule.shiftName === "GENERAL") { row.push("GENERAL"); continue; }

        const times = resolver.getShiftTimes(schedule.shiftName);
        const start = resolver.formatDisplayTime(times.openTime || schedule.startTime);
        const end = resolver.formatDisplayTime(times.closeTime || schedule.endTime);
        row.push(`${schedule.shiftName}${start ? ` (${start}-${end})` : ""}`);
      }
      bodyRows.push(row);
    }

    autoTable(doc, {
      head: [headers],
      body: bodyRows,
      startY: 20,
      styles: { fontSize: 6, cellPadding: 1 },
      headStyles: { fillColor: [70, 130, 180], fontSize: 7 },
      columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 14 }, 2: { cellWidth: 22 } },
      margin: { top: 20, left: 8, right: 8 },
      pageBreak: "auto",
    });

    doc.save(`Jadwal_${MONTH_NAMES[month - 1]}_${year}.pdf`);
  }

  // ── PNG export ────────────────────────────────────────────────
  async function handleExportPng() {
    const table = buildHtmlTable();
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "0";
    container.appendChild(table);
    document.body.appendChild(container);

    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(table, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        allowTaint: true,
      });
      const link = document.createElement("a");
      link.download = `Jadwal_${MONTH_NAMES[month - 1]}_${year}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Snapshot berhasil di-download");
    } catch (err) {
      // Fallback: use canvas directly
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      const rows = table.rows.length;
      const cols = table.rows[0]?.cells?.length ?? 1;
      canvas.width = cols * 120;
      canvas.height = rows * 24 + 30;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = "bold 14px Calibri, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#006100";
      ctx.fillText(`JADWAL ${MONTH_NAMES[month - 1].toUpperCase()} ${year}`, canvas.width / 2, 20);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < table.rows[r].cells.length; c++) {
          const cell = table.rows[r].cells[c];
          const x = c * 120;
          const y = r * 24 + 30;
          ctx.strokeStyle = "#808080";
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, 120, 24);
          ctx.font = "10px Calibri, sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = "#000000";
          ctx.fillText(cell.textContent || "", x + 60, y + 15);
        }
      }

      const link = document.createElement("a");
      link.download = `Jadwal_${MONTH_NAMES[month - 1]}_${year}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Snapshot berhasil di-download");
    } finally {
      document.body.removeChild(container);
    }
  }

  // ── Main handler ───────────────────────────────────────────────
  const handleExport = async () => {
    if (!schedulesByDate) return;
    setExporting(true);
    try {
      if (format === "matrix") {
        await exportRosterXlsx(schedulesByDate, month, year, shiftTemplates, { includeOff, includeGeneral });
        toast.success(`Export matrix: Jadwal_${MONTH_NAMES[month - 1]}_${year}.xlsx`);
      } else if (format === "flat") {
        await exportFlatXlsx(schedulesByDate, month, year);
        toast.success("Export flat table berhasil");
      } else if (format === "pdf") {
        await handleExportPdf();
        toast.success("Export PDF berhasil");
      } else if (format === "png") {
        await handleExportPng();
      }
      onClose();
    } catch (err) {
      toast.error("Gagal export: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-background p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Export Jadwal</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Download jadwal bulan {MONTH_NAMES[month - 1]} {year}
          </p>

          {/* Format selector */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Format Export</p>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30">
              <input type="radio" name="fmt" checked={format === "matrix"} onChange={() => setFormat("matrix")} className="h-4 w-4" />
              <div>
                <p className="text-sm font-medium">Excel — format gambar / roster matrix</p>
                <p className="text-xs text-muted-foreground">Header bertingkat, warna shift, merged header</p>
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30">
              <input type="radio" name="fmt" checked={format === "flat"} onChange={() => setFormat("flat")} className="h-4 w-4" />
              <div>
                <p className="text-sm font-medium"><FileText className="mr-1 inline h-3 w-3" /> Excel — table flat</p>
                <p className="text-xs text-muted-foreground">Baris per jadwal: Tanggal, Hari, Nama, Shift, Jam</p>
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30">
              <input type="radio" name="fmt" checked={format === "pdf"} onChange={() => setFormat("pdf")} className="h-4 w-4" />
              <div>
                <p className="text-sm font-medium"><FileText className="mr-1 inline h-3 w-3" /> PDF — print-ready</p>
                <p className="text-xs text-muted-foreground">Landscape A4, tabel roster warna</p>
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30">
              <input type="radio" name="fmt" checked={format === "png"} onChange={() => setFormat("png")} className="h-4 w-4" />
              <div>
                <p className="text-sm font-medium"><ImageIcon className="mr-1 inline h-3 w-3" /> PNG — snapshot</p>
                <p className="text-xs text-muted-foreground">Gambar jadwal, siap kirim ke Telegram/WA</p>
              </div>
            </label>
          </div>

          {/* Options for matrix */}
          {(format === "matrix" || format === "pdf" || format === "png") && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Opsi</p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={includeOff} onChange={(e) => setIncludeOff(e.target.checked)} className="h-3.5 w-3.5" />
                <span className="text-sm">Sertakan OFF</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={includeGeneral} onChange={(e) => setIncludeGeneral(e.target.checked)} className="h-3.5 w-3.5" />
                <span className="text-sm">Sertakan GENERAL</span>
              </label>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={handleExport} disabled={exporting}>
            <Download className="mr-1 h-4 w-4" />
            {exporting ? "Mengexport..." : 
              format === "matrix" ? "Download Excel" :
              format === "flat" ? "Download Excel (Flat)" :
              format === "pdf" ? "Download PDF" :
              "Download PNG"}
          </Button>
        </div>
      </div>
    </div>
  );
}
