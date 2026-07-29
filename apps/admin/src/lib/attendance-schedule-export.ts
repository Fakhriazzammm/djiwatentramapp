import type { AttendanceSchedule, SchedulesByDate } from "@/hooks/use-hybrid-attendance-schedules";
import type { ShiftSchedule } from "./attendance-schedule-import";
import { generateMonthDateRows, buildShiftResolver } from "./attendance-import-template";
import { getDay } from "date-fns";

// ─── Colors (default design tokens — editable) ─────────────────

const DEFAULT_COLORS = {
  title: { fill: "C6EFCE", font: "006100" }, // light green
  groupDJIWA: { fill: "4472C4", font: "FFFFFF" }, // blue
  groupTB: { fill: "ED7D31", font: "FFFFFF" }, // orange
  groupManagement: { fill: "C00000", font: "FFFFFF" }, // dark red
  shiftPagi: { fill: "C6EFCE", font: "006100" }, // green
  shiftSore: { fill: "BDD7EE", font: "1F4E79" }, // blue
  shiftOff: { fill: "FFC7CE", font: "9C0006" }, // red
  shiftGeneral: { fill: "D9D9D9", font: "595959" }, // grey
  headerText: { font: "000000" },
  border: "808080",
};

// ─── Helper: dot format ────────────────────────────────────────

function toDot(time?: string | null): string {
  if (!time) return "";
  return time.replace(":", ".");
}

// ─── Build matrix rows ─────────────────────────────────────────

export type ExportRow = (string | number | null)[];

type CellStyle = {
  fill?: { fgColor: string };
  font?: { color: string; bold?: boolean; sz?: number; name?: string };
  alignment?: { horizontal: string; vertical: string; wrapText?: boolean };
  border?: {
    top?: { style: string; color: string };
    bottom?: { style: string; color: string };
    left?: { style: string; color: string };
    right?: { style: string; color: string };
  };
};

type SheetMetadata = {
  rows: ExportRow[];
  merges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>;
  styles: Map<string, CellStyle>; // key: "r,c" or "all"
  cols: { wch: number }[];
  rowHeights?: Record<number, number>;
};

// ─── Staff grouping ────────────────────────────────────────────

type StaffEntry = {
  userId: string;
  userName: string;
  roleName: string;
  order: number;
  groupLabel?: string;
  groupColorKey?: string;
};

function buildStaffList(
  schedulesByDate: SchedulesByDate,
  groups?: Array<{
    label: string;
    roleLabel?: string;
    staff: Array<{ rawName: string; userId?: string; displayName?: string }>;
  }>
): StaffEntry[] {
  // Collect unique staff from schedules
  const staffMap = new Map<string, StaffEntry>();
  let order = 0;

  for (const schedules of Object.values(schedulesByDate)) {
    for (const s of schedules) {
      if (!staffMap.has(s.userId)) {
        staffMap.set(s.userId, {
          userId: s.userId,
          userName: s.userName,
          roleName: s.roleName,
          order: order++,
        });
      }
    }
  }

  return Array.from(staffMap.values()).sort((a, b) => a.order - b.order);
}

function buildGrid(
  schedulesByDate: SchedulesByDate,
  month: number,
  year: number,
  shiftSchedules: ShiftSchedule[],
  options: {
    includeOff?: boolean;
    includeGeneral?: boolean;
    groups?: Array<{
      label: string;
      roleLabel?: string;
      staff: Array<{ rawName: string; userId?: string; displayName?: string }>;
    }>;
  } = {}
): SheetMetadata {
  const resolver = buildShiftResolver(shiftSchedules);
  const dateRows = generateMonthDateRows(month, year);
  const staffEntries = buildStaffList(schedulesByDate, options.groups);

  // Build schedule lookup: date -> userId -> schedule
  const scheduleMap = new Map<string, Map<string, AttendanceSchedule>>();
  for (const [dateStr, schedules] of Object.entries(schedulesByDate)) {
    for (const s of schedules) {
      if (!scheduleMap.has(dateStr)) scheduleMap.set(dateStr, new Map());
      scheduleMap.get(dateStr)!.set(s.userId, s);
    }
  }

  // === Build rows ===
  const rows: ExportRow[] = [];
  const styles = new Map<string, CellStyle>();
  const merges: SheetMetadata["merges"] = [];

  // ROW 0: Title row - JADWAL <BULAN> <TAHUN> + group headers
  const monthNames = [
    "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
    "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"
  ];
  const titleText = `JADWAL ${monthNames[month - 1]} ${year}`;

  const headerRow1: ExportRow = [titleText, null, null];
  // Apply styles for Row 1
  styles.set("0,0", {
    fill: { fgColor: DEFAULT_COLORS.title.fill },
    font: { color: DEFAULT_COLORS.title.font, bold: true, sz: 14, name: "Calibri" },
    alignment: { horizontal: "center", vertical: "center" },
  });

  // Group labels in Row 1
  const groupColors = [DEFAULT_COLORS.groupDJIWA, DEFAULT_COLORS.groupTB, DEFAULT_COLORS.groupManagement];
  const groupLabels = options.groups ?? [];
  let colOffset = 3; // A=0, B=1, C=2, staff start at D=3

  // If no groups defined, create default from role grouping
  const roleGroups = new Map<string, StaffEntry[]>();
  for (const s of staffEntries) {
    const key = s.roleName || "Team";
    if (!roleGroups.has(key)) roleGroups.set(key, []);
    roleGroups.get(key)!.push(s);
  }

  const effectiveGroups = groupLabels.length > 0
    ? groupLabels
    : Array.from(roleGroups.entries()).map(([role, members]) => ({
        label: role,
        roleLabel: role,
        staff: members.map((m) => ({ rawName: m.userName, userId: m.userId, displayName: m.userName })),
      }));

  for (let gi = 0; gi < effectiveGroups.length; gi++) {
    const group = effectiveGroups[gi];
    const staffCount = group.staff.length;
    const startCol = colOffset;
    const endCol = colOffset + staffCount - 1;
    const colorIdx = Math.min(gi, groupColors.length - 1);

    // Fill title row cells for this group
    for (let c = colOffset; c <= endCol; c++) {
      headerRow1[c] = group.label;
      styles.set(`0,${c}`, {
        fill: { fgColor: groupColors[colorIdx].fill },
        font: { color: groupColors[colorIdx].font, bold: true, sz: 11, name: "Calibri" },
        alignment: { horizontal: "center", vertical: "center" },
      });
    }
    // Merged in title row
    if (staffCount > 1) {
      merges.push({ s: { r: 0, c: startCol }, e: { r: 0, c: endCol } });
    }
    // Title merges over this group
    if (startCol > 0) {
      // Merge title over date cols and this group
      merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: endCol } });
    }
    colOffset = endCol + 1;
  }

  // ROW 1: Sub-header - MINGGU KE, HARI, TANGGAL, role labels
  const headerRow2: ExportRow = ["MINGGU KE", "HARI", "TANGGAL"];
  colOffset = 3;
  for (const group of effectiveGroups) {
    const staffCount = group.staff.length;
    const startCol = colOffset;
    const endCol = colOffset + staffCount - 1;
    const roleLabel = group.roleLabel || group.label;
    for (let c = colOffset; c <= endCol; c++) {
      headerRow2[c] = roleLabel;
      styles.set(`1,${c}`, {
        font: { color: "000000", bold: true, sz: 10, name: "Calibri" },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: DEFAULT_COLORS.border },
          bottom: { style: "thin", color: DEFAULT_COLORS.border },
          left: { style: "thin", color: DEFAULT_COLORS.border },
          right: { style: "thin", color: DEFAULT_COLORS.border },
        },
      });
    }
    if (staffCount > 1) {
      merges.push({ s: { r: 1, c: startCol }, e: { r: 1, c: endCol } });
    }
    colOffset = endCol + 1;
  }

  // Style for header row 2 date columns
  for (let c = 0; c < 3; c++) {
    styles.set(`1,${c}`, {
      font: { color: "000000", bold: true, sz: 10, name: "Calibri" },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: DEFAULT_COLORS.border },
        bottom: { style: "thin", color: DEFAULT_COLORS.border },
        left: { style: "thin", color: DEFAULT_COLORS.border },
        right: { style: "thin", color: DEFAULT_COLORS.border },
      },
    });
  }

  // ROW 2: Actual header with staff names
  const headerRow3: ExportRow = ["MINGGU KE", "HARI", "TANGGAL"];
  colOffset = 3;
  for (const group of effectiveGroups) {
    for (const member of group.staff) {
      headerRow3[colOffset] = member.displayName || member.rawName;
      styles.set(`2,${colOffset}`, {
        font: { color: "000000", bold: true, sz: 10, name: "Calibri" },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: DEFAULT_COLORS.border },
          bottom: { style: "thin", color: DEFAULT_COLORS.border },
          left: { style: "thin", color: DEFAULT_COLORS.border },
          right: { style: "thin", color: DEFAULT_COLORS.border },
        },
      });
      colOffset++;
    }
  }

  // Style for header row 3 date columns
  for (let c = 0; c < 3; c++) {
    styles.set(`2,${c}`, {
      font: { color: "000000", bold: true, sz: 10, name: "Calibri" },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: DEFAULT_COLORS.border },
        bottom: { style: "thin", color: DEFAULT_COLORS.border },
        left: { style: "thin", color: DEFAULT_COLORS.border },
        right: { style: "thin", color: DEFAULT_COLORS.border },
      },
    });
  }

  // Build user ID -> col index lookup
  const userColumnMap = new Map<string, number>();
  let colIndex = 3;
  for (const group of effectiveGroups) {
    for (const member of group.staff) {
      if (member.userId) {
        userColumnMap.set(member.userId, colIndex);
      }
      colIndex++;
    }
  }

  // DATA ROWS
  let prevWeekLabel = "";
  for (let ri = 0; ri < dateRows.length; ri++) {
    const { dateStr, dayName, weekLabel } = dateRows[ri];
    const rowIndex = rows.length;
    const dataRow: ExportRow = [weekLabel, dayName, dateStr];

    // Find the day of week in image format
    const d = new Date(dateStr + "T00:00:00");
    const fullDayNames = ["MINGGU", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"];
    dataRow[1] = fullDayNames[getDay(d)];

    // Check if this is a new week separator
    if (prevWeekLabel !== "" && weekLabel !== prevWeekLabel) {
      // Add extra thick border to previous row bottom and current row top
      // We'll handle this via border styles
    }
    prevWeekLabel = weekLabel;

    // Fill shift cells
    for (const [userId, colIdx] of userColumnMap) {
      const rowSchedules = scheduleMap.get(dateStr);
      const schedule = rowSchedules?.get(userId);
      if (schedule) {
        const isOff = schedule.shiftName === "OFF";
        const isGeneral = schedule.shiftName === "GENERAL";

        if (isOff && !options.includeOff) {
          dataRow[colIdx] = null;
        } else if (isGeneral && !options.includeGeneral) {
          dataRow[colIdx] = null;
        } else if (isOff) {
          dataRow[colIdx] = "OFF";
          styles.set(`${rowIndex},${colIdx}`, {
            fill: { fgColor: DEFAULT_COLORS.shiftOff.fill },
            font: { color: DEFAULT_COLORS.shiftOff.font, bold: true, sz: 9, name: "Calibri" },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: { top: { style: "thin", color: DEFAULT_COLORS.border }, bottom: { style: "thin", color: DEFAULT_COLORS.border }, left: { style: "thin", color: DEFAULT_COLORS.border }, right: { style: "thin", color: DEFAULT_COLORS.border } },
          });
        } else if (isGeneral) {
          dataRow[colIdx] = "GENERAL";
          styles.set(`${rowIndex},${colIdx}`, {
            fill: { fgColor: DEFAULT_COLORS.shiftGeneral.fill },
            font: { color: DEFAULT_COLORS.shiftGeneral.font, sz: 9, name: "Calibri" },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: { top: { style: "thin", color: DEFAULT_COLORS.border }, bottom: { style: "thin", color: DEFAULT_COLORS.border }, left: { style: "thin", color: DEFAULT_COLORS.border }, right: { style: "thin", color: DEFAULT_COLORS.border } },
          });
        } else {
          // Regular shift — look up times from admin settings
          const times = resolver.getShiftTimes(schedule.shiftName);
          const startDot = toDot(times.openTime || schedule.startTime);
          const endDot = toDot(times.closeTime || schedule.endTime);
          const displayText = `${schedule.shiftName}${startDot ? ` (${startDot} - ${endDot})` : ""}`;
          dataRow[colIdx] = displayText;

          // Determine color by shift name
          const shiftUpper = schedule.shiftName.toUpperCase();
          let fillColor = DEFAULT_COLORS.shiftGeneral.fill;
          let fontColor = DEFAULT_COLORS.shiftGeneral.font;
          if (shiftUpper.includes("PAGI")) {
            fillColor = DEFAULT_COLORS.shiftPagi.fill;
            fontColor = DEFAULT_COLORS.shiftPagi.font;
          } else if (shiftUpper.includes("SORE")) {
            fillColor = DEFAULT_COLORS.shiftSore.fill;
            fontColor = DEFAULT_COLORS.shiftSore.font;
          }

          styles.set(`${rowIndex},${colIdx}`, {
            fill: { fgColor: fillColor },
            font: { color: fontColor, sz: 9, name: "Calibri" },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: { top: { style: "thin", color: DEFAULT_COLORS.border }, bottom: { style: "thin", color: DEFAULT_COLORS.border }, left: { style: "thin", color: DEFAULT_COLORS.border }, right: { style: "thin", color: DEFAULT_COLORS.border } },
          });
        }
      } else {
        dataRow[colIdx] = null;
      }
    }

    // Style for date columns
    for (let c = 0; c < 3; c++) {
      styles.set(`${rowIndex},${c}`, {
        font: { color: "000000", sz: 10, name: "Calibri" },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: DEFAULT_COLORS.border },
          bottom: { style: "thin", color: DEFAULT_COLORS.border },
          left: { style: "thin", color: DEFAULT_COLORS.border },
          right: { style: "thin", color: DEFAULT_COLORS.border },
        },
      });
    }

    rows.push(dataRow);
  }

  // Column widths
  const cols: { wch: number }[] = [
    { wch: 14 }, // MINGGU KE
    { wch: 10 }, // HARI
    { wch: 14 }, // TANGGAL
  ];
  for (let i = 0; i < userColumnMap.size; i++) {
    cols.push({ wch: 18 }); // staff column
  }

  // Row heights
  const rowHeights: Record<number, number> = {
    0: 30,
    1: 20,
    2: 20,
  };

  return { rows, merges, styles, cols, rowHeights };
}

// ─── XLSX export with styles ───────────────────────────────────

export async function exportRosterXlsx(
  schedulesByDate: SchedulesByDate,
  month: number,
  year: number,
  shiftSchedules: ShiftSchedule[],
  options: {
    includeOff?: boolean;
    includeGeneral?: boolean;
    staffGroups?: Array<{
      label: string;
      roleLabel?: string;
      staff: Array<{ rawName: string; userId?: string; displayName?: string }>;
    }>;
  } = {}
): Promise<void> {
  const grid = buildGrid(schedulesByDate, month, year, shiftSchedules, {
    includeOff: options.includeOff,
    includeGeneral: options.includeGeneral,
    groups: options.staffGroups,
  });

  const XLSX = await import("xlsx");

  // Convert rows to aoa
  const aoa: unknown[][] = grid.rows.map((r) => r.map((c) => c ?? ""));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = grid.cols;

  // Apply row heights
  ws["!rows"] = aoa.map((_, idx) => ({
    hpt: grid.rowHeights?.[idx] ?? 20,
  }));

  // Apply merges
  ws["!merges"] = grid.merges.map((m) => ({
    s: { r: m.s.r, c: m.s.c },
    e: { r: m.e.r, c: m.e.c },
  }));

  // Apply cell styles via s (style index) using basic xlsx styling
  // xlsx v0.18.5 supports limited styling through cell.s property
  for (const [key, style] of grid.styles) {
    const [row, col] = key.split(",").map(Number);
    if (row < aoa.length && col < aoa[0].length) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
      if (ws[cellRef]) {
        ws[cellRef].s = {
          fill: style.fill ? { fgColor: { rgb: style.fill.fgColor } } : undefined,
          font: style.font
            ? {
                color: { rgb: style.font.color },
                bold: style.font.bold,
                sz: style.font.sz ?? 10,
                name: style.font.name ?? "Calibri",
              }
            : undefined,
          alignment: style.alignment
            ? { horizontal: style.alignment.horizontal, vertical: style.alignment.vertical, wrapText: style.alignment.wrapText }
            : undefined,
          border: style.border
            ? {
                top: { style: style.border.top?.style ?? "thin", color: { rgb: style.border.top?.color ?? "808080" } },
                bottom: { style: style.border.bottom?.style ?? "thin", color: { rgb: style.border.bottom?.color ?? "808080" } },
                left: { style: style.border.left?.style ?? "thin", color: { rgb: style.border.left?.color ?? "808080" } },
                right: { style: style.border.right?.style ?? "thin", color: { rgb: style.border.right?.color ?? "808080" } },
              }
            : undefined,
        };
      }
    }
  }

  // Page setup for landscape
  ws["!print"] = {
    paperSize: 9, // A4
    orientation: "landscape",
    fitToWidth: 1,
    fitToHeight: 0,
  };

  const wb = XLSX.utils.book_new();
  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  XLSX.utils.book_append_sheet(wb, ws, `Jadwal ${monthNames[month - 1]} ${year}`);
  XLSX.writeFile(wb, `Jadwal_${monthNames[month - 1]}_${year}.xlsx`);
}

// ─── Flat export (legacy) ──────────────────────────────────────

export async function exportFlatXlsx(
  schedulesByDate: SchedulesByDate,
  month: number,
  year: number
): Promise<void> {
  const XLSX = await import("xlsx");
  const FULL_DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

  const rows: unknown[][] = [
    ["Tanggal", "Hari", "Nama Karyawan", "Role", "Shift", "Jam Mulai", "Jam Selesai", "Status", "Catatan"],
  ];

  const sortedDates = Object.entries(schedulesByDate).sort();
  for (const [dateStr, schedules] of sortedDates) {
    const d = new Date(dateStr + "T00:00:00");
    const dayName = FULL_DAY_NAMES[d.getDay()];
    for (const s of schedules) {
      if (s.shiftName === "OFF" || s.shiftName === "GENERAL") continue;
      rows.push([
        dateStr,
        dayName,
        s.userName,
        s.roleName,
        s.shiftName,
        s.startTime ?? "",
        s.endTime ?? "",
        s.status,
        s.note ?? "",
      ]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 }, { wch: 8 }, { wch: 20 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 20 },
  ];

  const wb = XLSX.utils.book_new();
  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  XLSX.utils.book_append_sheet(wb, ws, `Jadwal ${monthNames[month - 1]} ${year}`);
  XLSX.writeFile(wb, `Jadwal_Flat_${monthNames[month - 1]}_${year}.xlsx`);
}
