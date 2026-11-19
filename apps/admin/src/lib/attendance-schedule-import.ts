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
  /** Indeks kolom di sheet (nama staf bisa tidak berurutan). */
  col?: number;
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
  // HH.mm - HH.mm atau HH:mm - HH:mm, berdiri sendiri atau di dalam teks ("PAGI (06.30 - 14.00)")
  const rangeMatch = cleaned.match(
    /(\d{1,2})[.:](\d{2})\s*[-–—]\s*(\d{1,2})[.:](\d{2})/
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

      // Jam di sheet adalah sumber kebenaran per orang/hari. Jam pengaturan admin hanya dipakai
      // bila sheet tidak menulis jam, atau bila operator memilih "gunakan jam admin" saat impor.
      const fileTime = timeFromInput && timeFromInput.start && timeFromInput.end ? { start: timeFromInput.start, end: timeFromInput.end } : undefined;
      return {
        shiftName: schedule.name,
        normalizedTime: fileTime ?? (scheduledTime.start ? { start: scheduledTime.start, end: scheduledTime.end } : undefined),
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

  // 3a. Singkatan/nama panggilan: token sheet adalah subsequence token nama akun
  //     (ISAN ⊂ IKHSAN, DILA ⊂ DILLA, ANIDA ⊂ ANNIDA). Hanya bila rasio panjang >= 0.6.
  const isSubseq = (small: string, big: string) => { let i = 0; for (const ch of big) if (ch === small[i]) i++; return i === small.length; };
  const nick = n.split(" ").filter((t) => t.length >= 3);
  if (nick.length === 1) {
    const hits = liveStaff.filter((u) => normalizeName(u.name).split(" ").some((ut) => ut.length >= nick[0].length && nick[0].length / ut.length >= 0.6 && isSubseq(nick[0], ut)));
    if (hits.length === 1) {
      return { rawName, matchedUserId: hits[0]._id, matchedUserName: hits[0].name, matchedRoleName: hits[0].roleName, status: "mapped" };
    }
  }

  // 3b. Fuzzy token match
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

const MONTH_NAMES = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
/** Indeks bulan (0-11) dari nama penuh atau singkatan (OKT, NOV, DES, AGU, ...). */
function monthIndexFromName(raw: string): number {
  const u = raw.toUpperCase().replace(/[^A-Z]/g, "");
  if (u.length < 3) return -1;
  const alias: Record<string, number> = { OCT: 9, OKT: 9, DEC: 11, DES: 11, AUG: 7, AGS: 7, AGU: 7, MAY: 4, JUN: 5, JUL: 6 };
  if (alias[u.slice(0, 3)] !== undefined && u.length <= 4) return alias[u.slice(0, 3)];
  return MONTH_NAMES.findIndex((m) => m.startsWith(u.slice(0, 3)));
}

export function detectMonthYear(
  rows: string[][],
  _titlePattern?: string
): { month: number; year: number } | null {
  for (const row of rows) {
    const joined = row.join(" ").toUpperCase();
    // Pola: JADWAL <BULAN> <TAHUN>, bulan boleh disingkat (mis. "okt")
    const match = joined.match(/JADWAL\s+([A-Z]+)\s+(\d{4})/);
    if (match) {
      const idx = monthIndexFromName(match[1]);
      if (idx >= 0) return { month: idx + 1, year: parseInt(match[2]) };
    }
  }
  return null;
}

/** Tanggal dari sel: serial Excel (46327), ISO, "1 MEI 2026", atau angka hari saja. */
export function parseDateCell(cell: string, month: number, year: number): string | null {
  const c = cell.trim();
  if (!c) return null;
  if (/^\d{5}(\.0+)?$/.test(c)) {
    const serial = Math.floor(Number(c));
    if (serial > 30000 && serial < 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10);
  }
  const iso = c.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  if (month > 0) return parseDateFromRow([c], 0, month, year);
  const full = c.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (full) {
    const m = monthIndexFromName(full[2]);
    if (m >= 0) return `${full[3]}-${String(m + 1).padStart(2, "0")}-${String(+full[1]).padStart(2, "0")}`;
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

/** Label di baris header yang bukan nama staf. */
const NON_STAFF = /^(MINGGU\s*KE|HARI|TANGGAL|NO|JADWAL.*|DJIWA TENTRAM|TB WARMAN|MANAGEMENT.*|CEO.*)$/i;
const CONTRACT_LABEL = /(FULL\s*TIME|PART\s*TIME|\d\s*-\s*\d+\s*H)/i;

export function parseSpreadsheetMatrix(
  aoaRows: unknown[][],
  shiftSchedules: ShiftSchedule[]
): ParsedAttendanceImport {
  const rows = aoaRows.map((r) => r.map((c) => String(c ?? "")));
  const warnings: ImportWarning[] = [];
  const titled = detectMonthYear(rows);

  // Header: baris yang memuat TANGGAL. Nama staf ada di baris yang sama (format roster Djiwa)
  // atau, pada template lama, dua baris di bawahnya.
  const headerRowIndex = rows.findIndex((r, i) => i < 12 && r.some((c) => c.trim().toUpperCase() === "TANGGAL"));
  if (headerRowIndex < 0) {
    return {
      source: { fileType: "xlsx", month: titled?.month ?? 0, year: titled?.year ?? 0 },
      staffColumns: [], rows: [],
      warnings: [{ type: "unreadable_cell", message: "Header tidak ditemukan. Harus ada kolom TANGGAL." }],
    };
  }
  const headerRow = rows[headerRowIndex];
  const dateCol = headerRow.findIndex((c) => c.trim().toUpperCase() === "TANGGAL");

  const readStaff = (rowIdx: number) => {
    const row = rows[rowIdx] ?? [];
    const out: ParsedStaffColumn[] = [];
    for (let i = dateCol + 1; i < row.length; i++) {
      const name = row[i]?.trim();
      if (!name || NON_STAFF.test(name) || CONTRACT_LABEL.test(name)) continue;
      // Label peran (baris di atas header) jadi keterangan kolom.
      const role = (rows[headerRowIndex - 1]?.[i] ?? "").trim() || undefined;
      out.push({ rawName: name, col: i, role });
    }
    return out;
  };
  let staffColumns = readStaff(headerRowIndex);
  if (staffColumns.length === 0) staffColumns = readStaff(headerRowIndex + 2);
  // Nama ganda (mis. dua kolom "ISAN"): pertahankan kolom pertama.
  const seen = new Set<string>();
  staffColumns = staffColumns.filter((c) => (seen.has(normalizeName(c.rawName)) ? false : (seen.add(normalizeName(c.rawName)), true)));

  // Baca tanggal tiap baris. Bulan/tahun diambil dari tanggal itu sendiri bila sel
  // berisi tanggal lengkap (serial Excel atau ISO); judul hanya dipakai untuk angka hari polos.
  const provisionalMonth = titled?.month ?? 0, provisionalYear = titled?.year ?? 0;
  const dated: { rowIdx: number; date: string }[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const d = parseDateCell(rows[i][dateCol] ?? "", provisionalMonth, provisionalYear);
    if (d) dated.push({ rowIdx: i, date: d });
  }
  if (dated.length === 0) {
    return {
      source: { fileType: "xlsx", month: provisionalMonth, year: provisionalYear },
      staffColumns, rows: [],
      warnings: [{ type: "date_mismatch", message: "Tidak ada tanggal yang terbaca. Pastikan kolom TANGGAL berisi tanggal atau judul seperti 'JADWAL MEI 2026'." }],
    };
  }
  // Bulan dominan menurut tanggal.
  const tally = new Map<string, number>();
  for (const d of dated) tally.set(d.date.slice(0, 7), (tally.get(d.date.slice(0, 7)) ?? 0) + 1);
  const dominant = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const year = +dominant.slice(0, 4), month = +dominant.slice(5, 7);
  if (titled && (titled.month !== month || titled.year !== year)) {
    warnings.push({ type: "date_mismatch", message: `Judul menyebut ${MONTH_NAMES[titled.month - 1]} ${titled.year}, tetapi tanggalnya ${MONTH_NAMES[month - 1]} ${year}. Memakai tanggal di sheet.` });
  }

  const parsedRows: ParsedAttendanceRow[] = [];
  for (const { rowIdx, date } of dated) {
    // Baris ringkasan di luar bulan dominan (mis. sisa hari bulan berikutnya) tetap diikutkan: tanggalnya valid.
    const row = rows[rowIdx];
    for (const col of staffColumns) {
      const shiftCell = row[col.col ?? -1]?.trim() ?? "";
      if (!shiftCell) continue;
      const resolved = resolveShift(shiftCell, shiftSchedules);
      if (resolved.warning) warnings.push({ ...resolved.warning, rawStaffName: col.rawName, date });
      parsedRows.push({
        date,
        dayName: getDayName(date),
        weekLabel: getWeekLabel(date, +date.slice(5, 7)),
        rawStaffName: col.rawName,
        rawShiftText: shiftCell,
        shiftName: resolved.shiftName,
        startTime: resolved.normalizedTime?.start,
        endTime: resolved.normalizedTime?.end,
        status: resolved.status,
      });
    }
  }

  return {
    source: { fileType: "xlsx", month, year, title: `JADWAL ${MONTH_NAMES[month - 1]} ${year}` },
    staffColumns,
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
