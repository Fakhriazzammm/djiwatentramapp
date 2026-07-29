import { createClient } from "@/lib/client";

// ─── Types ─────────────────────────────────────────────────────

export type ParsedAttendanceImport = {
  source: {
    fileName?: string;
    fileType: "xlsx" | "csv" | "png" | "jpg" | "pdf" | "text";
    month: number;
    year: number;
    title?: string;
  };
  staffColumns: ParsedStaffColumn[];
  rows: ParsedAttendanceRow[];
  warnings: ImportWarning[];
  error?: string; // for AI error response
  rawContent?: string; // raw AI response on failure
};

export type ParsedStaffColumn = {
  rawName: string;
  outlet?: string;
  role?: string;
  contractLabel?: string;
};

export type ParsedAttendanceRow = {
  date: string; // ISO: yyyy-MM-dd
  dayName?: string;
  weekLabel?: string;
  rawStaffName: string;
  rawShiftText: string;
  shiftName: string;
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  status: "scheduled" | "off" | "general";
  confidence?: number;
};

export type ImportWarning = {
  type:
    | "unreadable_cell"
    | "date_mismatch"
    | "unknown_shift"
    | "unknown_staff"
    | "duplicate"
    | "shift_time_mismatch"
    | "role_mismatch";
  message: string;
  rowIndex?: number;
  rawStaffName?: string;
  date?: string;
};

export type StaffMapping = {
  rawName: string;
  matchedUserId?: string;
  matchedUserName?: string;
  matchedRoleName?: string;
  importedRoleLabel?: string;
  status: "mapped" | "unresolved" | "placeholder";
  placeholderLabel?: string;
};

export type ShiftSchedule = {
  name: string;
  openTime?: string;
  closeTime?: string;
};

export type ImportOptions = {
  startDate: string;
  endDate: string;
  mode: "replace" | "append";
  includeOff: boolean;
  includeGeneral: boolean;
  mappings: StaffMapping[];
  useAdminTime: boolean; // true = admin shift time wins, false = keep file time
};

export type ResolvedImportRow = {
  userId: string;
  date: string;
  shiftName: string;
  startTime?: string;
  endTime?: string;
  status: "scheduled" | "cancelled" | "off";
  note?: string;
  raw: Record<string, unknown>;
};

// ─── Shift label aliases ───────────────────────────────────────

const SHIFT_ALIASES: Record<string, string[]> = {
  PAGI: ["PAGI", "SHIFT PAGI", "SHIFT PAGI (07.30 - 14.30)", "PAGI (07.30 - 14.30)", "PAGI (07.30-14.30)", "PAGI (07:30-14:30)", "07.30 - 14.30", "07:30 - 14:30"],
  SORE: ["SORE", "SHIFT SORE", "SHIFT SORE (13.00 - 21.00)", "SORE (13.00 - 21.00)", "SORE (13.00-21.00)", "SORE (13:00-21:00)", "13.00 - 21.00", "13:00 - 21:00"],
};

const OFF_ALIASES = ["OFF", "LIBUR", "CUTI", "ISTIRAHAT"];
const GENERAL_ALIASES = ["GENERAL", "ALL", "UMUM"];

// ─── Name normalization ────────────────────────────────────────

export function normalizeName(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

// ─── Time normalization ────────────────────────────────────────

export function normalizeTime(input: string): string | null {
  const cleaned = input.trim().replace(/\s/g, "");
  // HH.mm or H.mm
  const dotMatch = cleaned.match(/^(\d{1,2})\.(\d{2})$/);
  if (dotMatch) {
    const h = dotMatch[1].padStart(2, "0");
    return `${h}:${dotMatch[2]}`;
  }
  // HH:mm
  const colonMatch = cleaned.match(/^(\d{2}):(\d{2})$/);
  if (colonMatch) return cleaned;
  return null;
}

export function normalizeTimeRange(input: string): { start: string | null; end: string | null } | null {
  const cleaned = input.trim();
  // Try HH.mm - HH.mm or HH:mm - HH:mm or various separators
  const rangeMatch = cleaned.match(
    /^(\d{1,2})[.:](\d{2})\s*[-–—]\s*(\d{1,2})[.:](\d{2})$/
  );
  if (rangeMatch) {
    const start = `${rangeMatch[1].padStart(2, "0")}:${rangeMatch[2]}`;
    const end = `${rangeMatch[3].padStart(2, "0")}:${rangeMatch[4]}`;
    return { start, end };
  }
  return null;
}

// ─── Shift label resolution ────────────────────────────────────

export function resolveShift(
  rawText: string,
  shiftSchedules: ShiftSchedule[]
): {
  shiftName: string;
  normalizedTime?: { start: string; end: string };
  status: "scheduled" | "off" | "general";
  warning?: ImportWarning;
} {
  const upper = rawText.trim().toUpperCase();

  // Check OFF
  for (const alias of OFF_ALIASES) {
    if (upper.includes(alias)) {
      return { shiftName: "OFF", status: "off" };
    }
  }

  // Check GENERAL
  for (const alias of GENERAL_ALIASES) {
    if (upper.includes(alias)) {
      return { shiftName: "GENERAL", status: "general" };
    }
  }

  // Try to match against configured shift schedules first
  for (const schedule of shiftSchedules) {
    const nameUpper = schedule.name.toUpperCase();
    if (upper === nameUpper || upper.startsWith(nameUpper)) {
      // Found a match - check if there's a time in the raw text
      const timeFromInput = normalizeTimeRange(rawText);
      const scheduledTime = {
        start: schedule.openTime ?? "",
        end: schedule.closeTime ?? "",
      };

      // Compare admin time vs file time
      let warning: ImportWarning | undefined;
      if (timeFromInput && (timeFromInput.start !== scheduledTime.start || timeFromInput.end !== scheduledTime.end)) {
        warning = {
          type: "shift_time_mismatch",
          message: `File shift time "${timeFromInput.start}-${timeFromInput.end}" berbeda dengan admin setting "${scheduledTime.start}-${scheduledTime.end}"`,
        };
      }

      return {
        shiftName: schedule.name,
        normalizedTime: scheduledTime.start ? { start: scheduledTime.start, end: scheduledTime.end } : undefined,
        status: "scheduled",
        warning,
      };
    }
  }

  // Fallback: try to extract from label alias
  for (const [key, aliases] of Object.entries(SHIFT_ALIASES)) {
    for (const alias of aliases) {
      if (upper.startsWith(alias) || alias.startsWith(upper)) {
        // Found by alias; try to find schedule with matching name
        const matched = shiftSchedules.find(
          (s) => s.name.toUpperCase().includes(key) || key.includes(s.name.toUpperCase())
        );
        if (matched) {
          return {
            shiftName: matched.name,
            normalizedTime: matched.openTime
              ? { start: matched.openTime, end: matched.closeTime ?? "" }
              : undefined,
            status: "scheduled",
          };
        }
        return { shiftName: key, status: "scheduled" };
      }
    }
  }

  // Check for any time range
  const timeRange = normalizeTimeRange(rawText);
  if (timeRange && timeRange.start && timeRange.end) {
    return {
      shiftName: upper.split("(")[0].trim() || "Unknown",
      normalizedTime: { start: timeRange.start, end: timeRange.end },
      status: "scheduled",
    };
  }

  // Unknown shift
  return {
    shiftName: upper.substring(0, 30),
    status: "scheduled",
  };
}

// ─── Staff alias resolver ──────────────────────────────────────

export type StaffAliasMap = Record<string, string>; // rawName -> app userName

export function resolveStaff(
  rawName: string,
  liveStaff: Array<{ _id: string; name: string; roleName: string }>,
  savedAliases?: StaffAliasMap
): StaffMapping {
  const n = normalizeName(rawName);

  // 1. Exact match by normalized name
  const exact = liveStaff.find((u) => normalizeName(u.name) === n);
  if (exact) {
    return {
      rawName,
      matchedUserId: exact._id,
      matchedUserName: exact.name,
      matchedRoleName: exact.roleName,
      status: "mapped",
    };
  }

  // 2. Check saved aliases
  if (savedAliases?.[rawName]) {
    const aliasMatch = liveStaff.find(
      (u) => u.name === savedAliases[rawName] || normalizeName(u.name) === normalizeName(savedAliases[rawName])
    );
    if (aliasMatch) {
      return {
        rawName,
        matchedUserId: aliasMatch._id,
        matchedUserName: aliasMatch.name,
        matchedRoleName: aliasMatch.roleName,
        status: "mapped",
      };
    }
  }

  // 3. Fuzzy token match
  const tokens = n.split(" ").filter(Boolean);
  const fuzzyMatches = liveStaff
    .map((u) => {
      const uTokens = normalizeName(u.name).split(" ").filter(Boolean);
      const common = tokens.filter((t) => uTokens.some((ut) => ut.includes(t) || t.includes(ut)));
      return { user: u, score: common.length / Math.max(tokens.length, uTokens.length) };
    })
    .filter((m) => m.score >= 0.5)
    .sort((a, b) => b.score - a.score);

  if (fuzzyMatches.length > 0) {
    const best = fuzzyMatches[0];
    return {
      rawName,
      matchedUserId: best.user._id,
      matchedUserName: best.user.name,
      matchedRoleName: best.user.roleName,
      status: "mapped",
    };
  }

  // 4. Unresolved
  return {
    rawName,
    status: "unresolved",
  };
}

export function resolveAllStaff(
  rawNames: string[],
  liveStaff: Array<{ _id: string; name: string; roleName: string }>,
  savedAliases?: StaffAliasMap
): StaffMapping[] {
  const seen = new Set<string>();
  const result: StaffMapping[] = [];
  for (const name of rawNames) {
    if (seen.has(normalizeName(name))) continue;
    seen.add(normalizeName(name));
    result.push(resolveStaff(name, liveStaff, savedAliases));
  }
  return result;
}

// ─── Spreadsheet matrix parser ────────────────────────────────

export function detectMonthYear(
  rows: string[][],
  titlePattern?: string
): { month: number; year: number } | null {
  for (const row of rows) {
    const joined = row.join(" ").toUpperCase();
    // Pattern: JADWAL <MONTH> <YEAR>
    const match = joined.match(/JADWAL\s+([A-Z]+)\s+(\d{4})/);
    if (match) {
      const monthNames = [
        "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
        "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"
      ];
      const monthIdx = monthNames.indexOf(match[1]);
      if (monthIdx >= 0) {
        return { month: monthIdx + 1, year: parseInt(match[2]) };
      }
    }
  }
  return null;
}

export function parseDateFromRow(row: string[], dateCol: number, month: number, year: number): string | null {
  const cell = row[dateCol]?.trim();
  if (!cell) return null;
  // Try: "1 MEI 2026"
  const fullDateMatch = cell.match(/(\d{1,2})\s+([A-Z]+)\s+(\d{4})/i);
  if (fullDateMatch) {
    const monthNames = [
      "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
      "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"
    ];
    const m = monthNames.indexOf(fullDateMatch[2].toUpperCase());
    if (m >= 0) {
      const d = parseInt(fullDateMatch[1]);
      return `${fullDateMatch[3]}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  // Try: just a number
  const dayMatch = cell.match(/^(\d{1,2})$/);
  if (dayMatch) {
    const d = parseInt(dayMatch[1]);
    return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

const WEEKDAY_MAP: Record<string, string> = {
  SENIN: "Senin", SELASA: "Selasa", RABU: "Rabu", KAMIS: "Kamis",
  JUMAT: "Jumat", SABTU: "Sabtu", MINGGU: "Minggu",
};

function getDayName(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  return days[d.getDay()];
}

function getWeekLabel(dateStr: string, month: number): string {
  const d = new Date(dateStr + "T00:00:00");
  const firstDay = new Date(d.getFullYear(), month - 1, 1);
  // Calculate which week of the month
  const diff = d.getDate() - firstDay.getDate();
  const weekNo = Math.floor((firstDay.getDay() + diff) / 7) + 1;
  return `Minggu Ke ${weekNo}`;
}

export function parseSpreadsheetMatrix(
  aoaRows: unknown[][],
  shiftSchedules: ShiftSchedule[]
): ParsedAttendanceImport {
  const rows = aoaRows.map((r) => r.map((c) => String(c ?? "")));

  // Detect month/year
  const detected = detectMonthYear(rows);
  if (!detected) {
    return {
      source: { fileType: "xlsx", month: 0, year: 0 },
      staffColumns: [],
      rows: [],
      warnings: [{ type: "date_mismatch", message: "Tidak dapat mendeteksi bulan/tahun dari file. Pastikan file memiliki judul seperti 'JADWAL MEI 2026'." }],
    };
  }

  const { month, year } = detected;
  const warnings: ImportWarning[] = [];

  // Find header rows — scan first ~10 rows
  const headerRowIndex = rows.findIndex(
    (r, i) => i < 10 && r.some((c) => c.trim().toUpperCase().includes("TANGGAL"))
  );

  if (headerRowIndex < 0) {
    return {
      source: { fileType: "xlsx", month, year },
      staffColumns: [],
      rows: [],
      warnings: [{ type: "unreadable_cell", message: "Header tidak ditemukan. Harus ada kolom TANGGAL." }],
    };
  }

  // Find date column index
  const headerRow = rows[headerRowIndex].map((c) => c.trim().toUpperCase());
  const dateCol = headerRow.findIndex((c) => c.includes("TANGGAL"));
  if (dateCol < 0) {
    return {
      source: { fileType: "xlsx", month, year },
      staffColumns: [],
      rows: [],
      warnings: [{ type: "unreadable_cell", message: "Kolom TANGGAL tidak ditemukan di header." }],
    };
  }

  // Detect staff columns: everything after dateCol + 2 columns (MINGGU KE, HARI, TANGGAL)
  const firstStaffCol = dateCol > 2 ? dateCol - 2 : 0; // try left of tanggal
  const staffHeaderRow3 = rows[headerRowIndex + 2] ?? [];
  const staffNames: string[] = [];
  for (let i = firstStaffCol; i < staffHeaderRow3.length; i++) {
    const name = staffHeaderRow3[i]?.trim();
    // Skip week/hari/tanggal columns
    if (i < dateCol + 2 && (i <= 2 || name === "MINGGU KE" || name === "HARI" || name === "TANGGAL")) continue;
    // Skip empty and likely header labels
    if (name === "" || name === "BARISTA" || name === "CHEF" || name === "7-9H (Full Time)" || name === "CEO / ADMIN") continue;
    if (name.startsWith("JADWAL") || name === "DJIWA TENTRAM" || name === "TB WARMAN" || name === "Management / Lainnya") continue;
    staffNames.push(name);
  }

  // Remove duplicates
  const uniqueStaff = [...new Set(staffNames)];

  // Parse date rows
  const parsedRows: ParsedAttendanceRow[] = [];
  const monthDays = new Date(year, month, 0).getDate();

  for (let i = headerRowIndex + 3; i < rows.length; i++) {
    const row = rows[i];
    const dateStr = parseDateFromRow(row, dateCol, month, year);
    if (!dateStr) continue;

    // Check if date is within expected range
    const day = parseInt(dateStr.split("-")[2]);
    if (day < 1 || day > monthDays) continue;

    const dayName = getDayName(dateStr);
    const weekLabel = getWeekLabel(dateStr, month);

    // Parse shift for each staff column
    for (let s = 0; s < uniqueStaff.length; s++) {
      const staffName = uniqueStaff[s];
      const colIdx = dateCol + (s + 1);
      const shiftCell = row[colIdx]?.trim() ?? "";
      if (!shiftCell) continue;

      const resolved = resolveShift(shiftCell, shiftSchedules);

      if (resolved.warning) {
        warnings.push({ ...resolved.warning, rawStaffName: staffName, date: dateStr });
      }

      parsedRows.push({
        date: dateStr,
        dayName,
        weekLabel,
        rawStaffName: staffName,
        rawShiftText: shiftCell,
        shiftName: resolved.shiftName,
        startTime: resolved.normalizedTime?.start,
        endTime: resolved.normalizedTime?.end,
        status: resolved.status,
      });
    }
  }

  return {
    source: { fileType: "xlsx", month, year, title: `JADWAL ${["", "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"][month]} ${year}` },
    staffColumns: uniqueStaff.map((n) => ({ rawName: n })),
    rows: parsedRows,
    warnings,
  };
}

// ─── Bulk replace logic ────────────────────────────────────────

export async function bulkReplaceAttendanceSchedules(
  inputs: ResolvedImportRow[],
  startDate: string,
  endDate: string,
  userIds: string[]
): Promise<{ inserted: number; deleted: number }> {
  const supabase = createClient();
  const pos = supabase.schema("pos");

  // Delete existing for these users + date range
  let deleted = 0;
  if (userIds.length > 0) {
    const { count } = await pos
      .from("attendance_schedules")
      .delete({ count: "exact" })
      .in("user_id", userIds)
      .gte("date", startDate)
      .lte("date", endDate);
    deleted = count ?? 0;
  }

  // Insert new
  if (inputs.length > 0) {
    const records = inputs.map((i) => ({
      source_id: crypto.randomUUID(),
      user_id: i.userId,
      date: i.date,
      shift_name: i.shiftName,
      start_time: i.startTime ?? null,
      end_time: i.endTime ?? null,
      status: i.status,
      note: i.note ?? null,
      raw: i.raw,
    }));

    const { error } = await pos.from("attendance_schedules").insert(records);
    if (error) throw error;
  }

  return { inserted: inputs.length, deleted };
}
