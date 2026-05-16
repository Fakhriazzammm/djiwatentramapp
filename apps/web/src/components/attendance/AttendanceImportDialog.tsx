import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, Image, FileText, AlertTriangle, Check, X, Loader2, Search, User } from "lucide-react";
import { createClient } from "@/lib/client";
import type { ParsedAttendanceImport, StaffMapping, ImportOptions, ResolvedImportRow } from "@/lib/attendance-schedule-import";
import { parseSpreadsheetMatrix, resolveAllStaff, resolveShift } from "@/lib/attendance-schedule-import";
import type { AttendanceSchedule } from "@/hooks/use-hybrid-attendance-schedules";
import type { ShiftSchedule } from "@/lib/attendance-schedule-import";

type ImportStep = "upload" | "processing" | "preview" | "confirm";

type ImportDialogProps = {
  open: boolean;
  onClose: () => void;
  onImport: (
    rows: ResolvedImportRow[],
    userIds: string[],
    startDate: string,
    endDate: string,
    options: ImportOptions
  ) => Promise<void>;
  shiftTemplates: ShiftSchedule[];
  liveStaff: Array<{ _id: string; name: string; roleName: string }>;
  month: number;
  year: number;
};

export default function AttendanceImportDialog({
  open,
  onClose,
  onImport,
  shiftTemplates,
  liveStaff,
  month,
  year,
}: ImportDialogProps) {
  const [step, setStep] = useState<ImportStep>("upload");
  const [tab, setTab] = useState<"upload" | "paste">("upload");
  const [pasteText, setPasteText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<ParsedAttendanceImport | null>(null);
  const [mappings, setMappings] = useState<StaffMapping[]>([]);
  const [importOptions, setImportOptions] = useState<{
    mode: "replace" | "append";
    includeOff: boolean;
    includeGeneral: boolean;
    useAdminTime: boolean;
  }>({
    mode: "replace",
    includeOff: false,
    includeGeneral: true,
    useAdminTime: true,
  });
  const [filter, setFilter] = useState<"all" | "unmapped" | "warning">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep("upload");
      setTab("upload");
      setPasteText("");
      setSelectedFile(null);
      setImportData(null);
      setMappings([]);
      setFilter("all");
    }
  }, [open]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    processFile(file);
  }, [shiftTemplates]);

  const processFile = useCallback(async (file: File) => {
    setStep("processing");
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      
      if (ext === "xlsx" || ext === "csv") {
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
        const parsed = parseSpreadsheetMatrix(aoa, shiftTemplates);
        if (parsed.warnings.length > 0 && parsed.rows.length === 0) {
          toast.error(parsed.warnings[0]?.message || "Gagal parse file");
          setStep("upload");
          return;
        }
        setImportData(parsed);
        const staffNames = parsed.staffColumns.map((c) => c.rawName);
        setMappings(resolveAllStaff(staffNames, liveStaff));
        setStep("preview");
      } else if (["png", "jpg", "jpeg"].includes(ext ?? "")) {
        // AI parse via edge function
        const base64 = await fileToBase64(file);
        const supabase = createClient();
        const { data, error } = await supabase.functions.invoke("yumi-ai", {
          body: {
            action: "parseAttendanceSchedule",
            fileType: ext,
            images: [base64],
            monthHint: month,
            yearHint: year,
            staffHints: liveStaff.map((u) => ({ name: u.name, roleName: u.roleName })),
            shiftHints: shiftTemplates.map((s) => ({ name: s.name, openTime: s.openTime, closeTime: s.closeTime })),
          },
        });

        if (error) {
          toast.error("Gagal memproses gambar: " + error.message);
          setStep("upload");
          return;
        }

        const parsed = data as ParsedAttendanceImport;
        if (parsed.error) {
          toast.error("AI gagal parse: " + (parsed.error as string));
          setStep("upload");
          return;
        }

        setImportData(parsed);
        const staffNames = parsed.staffColumns?.map((c: any) => c.rawName) ?? [];
        setMappings(resolveAllStaff(staffNames, liveStaff));
        setStep("preview");
      } else {
        toast.error("Format file tidak didukung. Gunakan .xlsx, .csv, .png, atau .jpg");
        setStep("upload");
      }
    } catch (err) {
      toast.error("Gagal membaca file: " + (err instanceof Error ? err.message : "Unknown error"));
      setStep("upload");
    }
  }, [shiftTemplates, liveStaff, month, year]);

  const handlePasteProcess = useCallback(async () => {
    if (!pasteText.trim()) return;
    setStep("processing");

    try {
      // Try to parse as matrix (tab or pipe-delimited)
      const lines = pasteText.trim().split("\n");
      const rows = lines.map((l) => l.split(/\t|\|/).map((c) => c.trim()));

      if (rows.length > 3) {
        const parsed = parseSpreadsheetMatrix(rows, shiftTemplates);
        if (parsed.rows.length > 0 || parsed.warnings.length === 0 || !parsed.warnings[0]?.message.includes("Tidak")) {
          setImportData(parsed);
          const staffNames = parsed.staffColumns.map((c) => c.rawName);
          setMappings(resolveAllStaff(staffNames, liveStaff));
          setStep("preview");
          return;
        }
      }

      // Fallback: AI parse
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("yumi-ai", {
        body: {
          action: "parseAttendanceSchedule",
          fileType: "text",
          text: pasteText,
          monthHint: month,
          yearHint: year,
          staffHints: liveStaff.map((u) => ({ name: u.name, roleName: u.roleName })),
          shiftHints: shiftTemplates.map((s) => ({ name: s.name, openTime: s.openTime, closeTime: s.closeTime })),
        },
      });

      if (error) {
        toast.error("Gagal memproses teks: " + error.message);
        setStep("upload");
        return;
      }

      const parsed = data as ParsedAttendanceImport;
      if (parsed.error) {
        toast.error("AI gagal parse: " + (parsed.error as string));
        setStep("upload");
        return;
      }

      setImportData(parsed);
      const staffNames = parsed.staffColumns?.map((c: any) => c.rawName) ?? [];
      setMappings(resolveAllStaff(staffNames, liveStaff));
      setStep("preview");
    } catch (err) {
      toast.error("Gagal memproses teks");
      setStep("upload");
    }
  }, [pasteText, shiftTemplates, liveStaff, month, year]);

  const handleMappingChange = useCallback((rawName: string, userId: string) => {
    setMappings((prev) =>
      prev.map((m) => {
        if (m.rawName !== rawName) return m;
        const user = liveStaff.find((u) => u._id === userId);
        return {
          ...m,
          matchedUserId: userId,
          matchedUserName: user?.name,
          matchedRoleName: user?.roleName,
          status: "mapped" as const,
        };
      })
    );
  }, [liveStaff]);

  const handleConfirmImport = useCallback(async () => {
    if (!importData) return;

    const allMapped = mappings.every((m) => m.status === "mapped");
    if (!allMapped) {
      toast.error("Semua staff harus di-map sebelum import");
      return;
    }

    // Build ResolvedImportRow[]
    const resolvedRows: ResolvedImportRow[] = [];
    const mappedUserIds = mappings
      .filter((m) => m.status === "mapped" && m.matchedUserId)
      .map((m) => m.matchedUserId!)
    const usedUserIds = new Set<string>();

    for (const row of importData.rows) {
      const mapping = mappings.find(
        (m) => m.rawName === row.rawStaffName && m.matchedUserId
      );
      if (!mapping?.matchedUserId) continue;

      // Skip OFF if not included
      if (row.status === "off" && !importOptions.includeOff) continue;
      if (row.status === "general" && !importOptions.includeGeneral) continue;

      let startTime = row.startTime;
      let endTime = row.endTime;

      if (importOptions.useAdminTime && row.status === "scheduled") {
        const resolved = resolveShift(row.rawShiftText, shiftTemplates);
        if (resolved.normalizedTime) {
          startTime = resolved.normalizedTime.start;
          endTime = resolved.normalizedTime.end;
        }
      }

      usedUserIds.add(mapping.matchedUserId);

      resolvedRows.push({
        userId: mapping.matchedUserId,
        date: row.date,
        shiftName: row.shiftName,
        startTime,
        endTime,
        status: row.status === "off" ? "off" : "scheduled",
        note: row.weekLabel ? `Imported from ${importData.source.title || "roster"}` : undefined,
        raw: {
          source: "attendance_import",
          sourceType: importData.source.fileType,
          sourceTitle: importData.source.title,
          rawStaffName: row.rawStaffName,
          rawShiftText: row.rawShiftText,
          importBatchId: crypto.randomUUID(),
        },
      });
    }

    const dates = importData.rows.map((r) => r.date).filter(Boolean);
    const startDate = dates.reduce((min, d) => (d < min ? d : min), dates[0] || `${year}-${String(month).padStart(2, "0")}-01`);
    const endDate = dates.reduce((max, d) => (d > max ? d : max), dates[0] || `${year}-${String(month).padStart(2, "0")}-28`);

    await onImport(resolvedRows, Array.from(usedUserIds), startDate, endDate, {
      ...importOptions,
      startDate,
      endDate,
      mappings,
    } as unknown as ImportOptions);

    toast.success(`Berhasil mengimport ${resolvedRows.length} jadwal`);
    onClose();
  }, [importData, mappings, importOptions, shiftTemplates, month, year, onImport, onClose]);

  // Compute warnings and stats
  const unmappedStaff = mappings.filter((m) => m.status !== "mapped");
  const warnings = importData?.warnings ?? [];
  const totalCells = importData?.rows?.length ?? 0;
  const totalDates = new Set(importData?.rows?.map((r) => r.date) ?? []).size;
  const totalStaffCols = importData?.staffColumns?.length ?? 0;

  // Filter rows for preview
  const filteredRows = importData?.rows?.filter((row) => {
    if (filter === "unmapped") {
      const m = mappings.find((m) => m.rawName === row.rawStaffName);
      return m?.status !== "mapped";
    }
    if (filter === "warning") {
      return warnings.some((w) => w.rawStaffName === row.rawStaffName && w.date === row.date);
    }
    return true;
  }).slice(0, 100) ?? [];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold text-lg">Import Jadwal</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === "upload" && (
            <div className="space-y-4">
              {/* Tabs */}
              <div className="flex gap-2 border-b pb-2">
                <button
                  className={`rounded-t px-4 py-1.5 text-sm font-medium transition-colors ${
                    tab === "upload" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setTab("upload")}
                >
                  <Upload className="mr-1 inline h-4 w-4" />
                  Upload File
                </button>
                <button
                  className={`rounded-t px-4 py-1.5 text-sm font-medium transition-colors ${
                    tab === "paste" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setTab("paste")}
                >
                  <FileText className="mr-1 inline h-4 w-4" />
                  Paste Spreadsheet
                </button>
              </div>

              {tab === "upload" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1">
                      <FileSpreadsheet className="h-3 w-3" /> .xlsx / .csv
                    </span>
                    <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1">
                      <Image className="h-3 w-3" /> .png / .jpg
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Format yang didukung: jadwal matrix bulanan dengan judul &ldquo;JADWAL <i>Bulan Tahun</i>&rdquo;.
                  </p>
                  <div
                    className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 transition-colors hover:border-primary/40 hover:bg-muted/30"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-10 w-10 text-muted-foreground/60" />
                    <p className="text-sm font-medium">Klik untuk upload file</p>
                    <p className="text-xs text-muted-foreground">atau drag and drop file</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.csv,.png,.jpg,.jpeg"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                </div>
              )}

              {tab === "paste" && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Paste teks jadwal dari spreadsheet atau CSV:
                  </p>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={10}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                    placeholder={`Contoh header dari Excel:\nJADWAL MEI 2026\nMINGGU KE | HARI | TANGGAL | AYUNDA | SELIN | ISAN | ...\n1 | JUMAT | 1 | PAGI (07.30-14.30) | SORE (13.00-21.00) | OFF | ...`}
                  />
                  <Button
                    className="w-full"
                    onClick={handlePasteProcess}
                    disabled={!pasteText.trim()}
                  >
                    Parse Teks
                  </Button>
                </div>
              )}
            </div>
          )}

          {step === "processing" && (
            <div className="flex flex-col items-center justify-center gap-4 py-20">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="font-medium">Memproses file...</p>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>Membaca header staff</span>
                <span>•</span>
                <span>Membaca tanggal</span>
                <span>•</span>
                <span>Menormalkan shift</span>
                <span>•</span>
                <span>Mencocokkan nama</span>
              </div>
            </div>
          )}

          {step === "preview" && importData && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Sumber</p>
                  <p className="mt-1 text-sm font-semibold">{importData.source.title || "File"}</p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Total Tanggal</p>
                  <p className="mt-1 text-lg font-semibold">{totalDates}</p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Kolom Staff</p>
                  <p className="mt-1 text-lg font-semibold">{totalStaffCols}</p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Total Jadwal</p>
                  <p className="mt-1 text-lg font-semibold">{totalCells}</p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Warning</p>
                  <p className={`mt-1 text-lg font-semibold ${warnings.length > 0 ? "text-orange-500" : "text-green-500"}`}>
                    {warnings.length || "✓"}
                  </p>
                </div>
              </div>

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="space-y-1.5 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-950">
                  <p className="flex items-center gap-1 text-sm font-medium text-orange-600 dark:text-orange-400">
                    <AlertTriangle className="h-4 w-4" /> Peringatan ({warnings.length})
                  </p>
                  {warnings.slice(0, 5).map((w, i) => (
                    <p key={i} className="text-xs text-orange-600 dark:text-orange-400">
                      {w.message}
                    </p>
                  ))}
                  {warnings.length > 5 && (
                    <p className="text-xs text-orange-500">
                      ...dan {warnings.length - 5} warning lainnya
                    </p>
                  )}
                </div>
              )}

              {/* Staff mapping */}
              {unmappedStaff.length > 0 && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950">
                  <p className="flex items-center gap-1 text-sm font-medium text-yellow-600 dark:text-yellow-400">
                    <User className="h-4 w-4" /> Staff yang belum di-map ({unmappedStaff.length})
                  </p>
                  {unmappedStaff.map((m) => (
                    <div key={m.rawName} className="mt-2 flex items-center gap-2">
                      <span className="shrink-0 text-sm font-medium">{m.rawName}</span>
                      <select
                        className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
                        value=""
                        onChange={(e) => handleMappingChange(m.rawName, e.target.value)}
                      >
                        <option value="">Pilih karyawan...</option>
                        {liveStaff.map((u) => (
                          <option key={u._id} value={u._id}>
                            {u.name} ({u.roleName})
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {/* Preview table */}
              <div className="max-h-48 overflow-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="px-2 py-1 text-left">Tanggal</th>
                      <th className="px-2 py-1 text-left">Hari</th>
                      <th className="px-2 py-1 text-left">Nama</th>
                      <th className="px-2 py-1 text-left">Shift</th>
                      <th className="px-2 py-1 text-left">Jam</th>
                      <th className="px-2 py-1 text-left">Status</th>
                      <th className="px-2 py-1 text-left">Conf.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, i) => {
                      const mapping = mappings.find((m) => m.rawName === row.rawStaffName);
                      return (
                        <tr key={i} className="border-t border-border/40">
                          <td className="px-2 py-1">{row.date}</td>
                          <td className="px-2 py-1">{row.dayName}</td>
                          <td className="px-2 py-1">
                            <span className={mapping?.status === "mapped" ? "" : "text-orange-500"}>
                              {mapping?.matchedUserName || row.rawStaffName}
                            </span>
                          </td>
                          <td className="px-2 py-1">{row.shiftName}</td>
                          <td className="px-2 py-1">
                            {row.startTime ? `${row.startTime}-${row.endTime}` : "-"}
                          </td>
                          <td className="px-2 py-1">
                            <span
                              className={
                                row.status === "off"
                                  ? "text-red-500"
                                  : row.status === "general"
                                  ? "text-gray-400"
                                  : "text-blue-600"
                              }
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="px-2 py-1">{row.confidence ? `${Math.round(row.confidence * 100)}%` : "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Filters */}
              <div className="flex gap-2">
                {(["all", "unmapped", "warning"] as const).map((f) => (
                  <button
                    key={f}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      filter === f
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                    onClick={() => setFilter(f)}
                  >
                    {f === "all" ? "Semua" : f === "unmapped" ? "Butuh Mapping" : "Warning"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-3">
          {step === "upload" && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Batal
              </Button>
            </div>
          )}

          {step === "preview" && (
            <div className="flex flex-col gap-2">
              {/* Import options */}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={importOptions.includeOff}
                    onChange={(e) => setImportOptions((o) => ({ ...o, includeOff: e.target.checked }))}
                    className="h-3.5 w-3.5"
                  />
                  Sertakan OFF di kalender
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={importOptions.includeGeneral}
                    onChange={(e) => setImportOptions((o) => ({ ...o, includeGeneral: e.target.checked }))}
                    className="h-3.5 w-3.5"
                  />
                  Sertakan GENERAL
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={importOptions.mode === "replace"}
                    onChange={(e) => setImportOptions((o) => ({ ...o, mode: e.target.checked ? "replace" : "append" }))}
                    className="h-3.5 w-3.5"
                  />
                  Replace jadwal bulan ini untuk karyawan terkait
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={importOptions.useAdminTime}
                    onChange={(e) => setImportOptions((o) => ({ ...o, useAdminTime: e.target.checked }))}
                    className="h-3.5 w-3.5"
                  />
                  Pakai jam dari pengaturan admin
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setStep("upload")}>
                  Kembali
                </Button>
                <Button
                  onClick={handleConfirmImport}
                  disabled={mappings.some((m) => m.status !== "mapped")}
                >
                  <Check className="mr-1 h-4 w-4" />
                  Import {totalCells} Jadwal
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data:image/...;base64, prefix
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
