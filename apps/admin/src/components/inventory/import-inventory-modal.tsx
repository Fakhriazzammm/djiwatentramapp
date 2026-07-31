import { AnimatePresence, motion } from "framer-motion";
import {
  Upload,
  FileSpreadsheet,
  Check,
  AlertCircle,
  Loader2,
  X,
  Download,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useHybridUpdateInventoryItem } from "@/hooks/use-hybrid-write-actions";
import { triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";

/* InventoryWorkspaceRow type — matches the one in inventory.lazy.tsx */
interface InventoryWorkspaceRow {
  inventoryId: string;
  ingredientName: string;
  currentStock: number;
  unit: string;
  displayUnit?: string;
  conversionFactor?: number;
  lowStockThreshold: number;
  lastPurchasePrice: number | null;
  preferredPurchaseQuantity: number | null;
  preferredPurchaseUnit: string | null;
  defaultBrandName: string | null;
  imagePath?: string | null;
  unitConversions?: Array<{ unit: string; factor: number }>;
  [key: string]: unknown;
}

/* ── column mapping ── */
const COLUMN_MAP: Record<string, string> = {
  "nama bahan": "ingredientName",
  "stok saat ini": "quantity",
  "harga beli terakhir": "lastPurchasePrice",
  "stok minimum": "lowStockThreshold",
  kategori: "category",
  "satuan unit": "unit",
  "merk default": "defaultBrandName",
  "qty beli per pesan": "preferredPurchaseQuantity",
  "unit beli": "preferredPurchaseUnit",
  "net weight": "netWeight",
  terakhir: "lastPurchaseAt",
  toko: "preferredStoreId",
  "faktor konversi": "conversionFactor",
};

type ImportRow = {
  rowIndex: number;
  ingredientName: string;
  changes: Record<string, { oldVal: unknown; newVal: unknown }>;
  /** The raw parsed values keyed by db-field name */
  parsed: Record<string, unknown>;
  matched: boolean;
};

type Step = "upload" | "preview" | "importing" | "done";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workspaceRows: InventoryWorkspaceRow[];
}

export default function ImportInventoryModal({
  isOpen,
  onClose,
  workspaceRows,
}: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, errors: 0 });
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateInventoryItem = useHybridUpdateInventoryItem();

  /* ── reset on open ── */
  useEffect(() => {
    if (isOpen) {
      setStep("upload");
      setImportRows([]);
      setProgress({ current: 0, total: 0, errors: 0 });
      setDragOver(false);
    }
  }, [isOpen]);

  /* ── parse file ── */
  const parseFile = useCallback(
    (file: File) => {
      if (
        !file.name.endsWith(".xlsx") &&
        !file.name.endsWith(".xls") &&
        !file.name.endsWith(".csv")
      ) {
        toast.error("Hanya file .xlsx, .xls, atau .csv yang didukung");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
            defval: "",
          }) as Record<string, unknown>[];

          if (json.length === 0) {
            toast.error("File kosong — tidak ada data yang ditemukan");
            return;
          }

          /* detect column mapping */
          const headers = Object.keys(json[0]);
          const fieldMap: Record<string, string> = {};
          for (const h of headers) {
            const key = h.trim().toLowerCase().replace(/[_\s]+/g, " ");
            const mapped = COLUMN_MAP[key];
            if (mapped) fieldMap[mapped] = h;
          }

          if (!fieldMap["ingredientName"]) {
            toast.error(
              "Kolom 'Nama Bahan' tidak ditemukan di file. Pastikan header sesuai template."
            );
            return;
          }

          /* build import rows */
          const nameField = fieldMap["ingredientName"];
          const rows: ImportRow[] = [];

          for (let i = 0; i < json.length; i++) {
            const row = json[i];
            const rawName = String(row[nameField] ?? "").trim();
            if (!rawName) continue;

            const parsed: Record<string, unknown> = {};
            for (const [field, header] of Object.entries(fieldMap)) {
              const val = row[header];
              if (field === "quantity" || field === "lowStockThreshold") {
                parsed[field] = val === "" ? undefined : Number(val);
              } else if (
                field === "lastPurchasePrice" ||
                field === "preferredPurchaseQuantity"
              ) {
                parsed[field] = val === "" ? null : Number(val);
              } else if (
                field === "conversionFactor"
              ) {
                parsed[field] = val === "" ? undefined : Number(val);
              } else {
                parsed[field] = val === "" ? undefined : String(val);
              }
            }
            parsed["ingredientName"] = rawName;

            /* match with existing inventory */
            const matchedRow = workspaceRows.find(
              (r) => r.ingredientName.toLowerCase().trim() === rawName.toLowerCase().trim()
            );

            const changes: Record<string, { oldVal: unknown; newVal: unknown }> = {};
            for (const [field, newVal] of Object.entries(parsed)) {
              if (field === "ingredientName") continue;
              if (newVal === undefined || newVal === null) continue;
              if (newVal === "") continue;

              let oldVal: unknown;
              if (matchedRow) {
                if (field === "quantity") oldVal = matchedRow.currentStock;
                else if (field === "lowStockThreshold") oldVal = matchedRow.lowStockThreshold;
                else if (field === "lastPurchasePrice") oldVal = matchedRow.lastPurchasePrice;
                else if (field === "preferredPurchaseQuantity") oldVal = matchedRow.preferredPurchaseQuantity;
                else if (field === "category") oldVal = (matchedRow as any).category;
                else if (field === "unit") oldVal = matchedRow.unit;
                else if (field === "defaultBrandName") oldVal = matchedRow.defaultBrandName;
                else if (field === "preferredPurchaseUnit") oldVal = matchedRow.preferredPurchaseUnit;
                else if (field === "netWeight") oldVal = (matchedRow as any).netWeight;
                else if (field === "conversionFactor") oldVal = matchedRow.conversionFactor;
                else oldVal = undefined;
              }

              if (String(oldVal ?? "") !== String(newVal)) {
                changes[field] = { oldVal, newVal };
              }
            }

            rows.push({
              rowIndex: i + 2,
              ingredientName: rawName,
              changes,
              parsed,
              matched: !!matchedRow,
            });
          }

          setImportRows(rows);
          setStep("preview");
        } catch (err) {
          console.error("[import] parse error", err);
          toast.error("Gagal membaca file. Pastikan format Excel benar.");
        }
      };
      reader.readAsArrayBuffer(file);
    },
    [workspaceRows]
  );

  /* ── run import ── */
  const runImport = useCallback(async () => {
    setStep("importing");
    let errors = 0;

    for (let i = 0; i < importRows.length; i++) {
      const row = importRows[i];
      const item = workspaceRows.find(
        (r) => r.ingredientName.toLowerCase().trim() === row.ingredientName.toLowerCase().trim()
      );

      if (!item) {
        errors++;
        setProgress({ current: i + 1, total: importRows.length, errors });
        continue;
      }

      if (Object.keys(row.changes).length === 0) {
        setProgress({ current: i + 1, total: importRows.length, errors });
        continue;
      }

      try {
        const payload: Record<string, unknown> = { id: item.inventoryId };
        for (const [field, change] of Object.entries(row.changes)) {
          payload[field] = change.newVal;
        }
        await updateInventoryItem(payload);
      } catch (err) {
        console.error(`[import] error updating ${row.ingredientName}:`, err);
        errors++;
        toast.error(`Gagal update "${row.ingredientName}"`);
      }

      setProgress({ current: i + 1, total: importRows.length, errors });
    }

    triggerHybridRefresh();
    setStep("done");
    toast.success(
      `Import selesai: ${importRows.length - errors} berhasil, ${errors} gagal`
    );
  }, [importRows, workspaceRows, updateInventoryItem]);

  /* ── download template ── */
  const downloadTemplate = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const data = [
      {
        "Nama Bahan": "",
        "Stok Saat Ini": "",
        "Stok Minimum": "",
        "Harga Beli Terakhir": "",
        Kategori: "",
        "Satuan Unit": "",
        "Merk Default": "",
        "Qty Beli per Pesan": "",
        "Unit Beli": "",
        "Net Weight": "",
        "Faktor Konversi": "",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template-import-inventory.xlsx");
  }, []);

  /* ── computed stats ── */
  const matchedCount = importRows.filter((r) => r.matched).length;
  const unmatchedCount = importRows.filter((r) => !r.matched).length;
  const withChanges = importRows.filter((r) => Object.keys(r.changes).length > 0).length;

  /* ── render helpers ── */
  const fieldLabel: Record<string, string> = {
    quantity: "Stok",
    lowStockThreshold: "Min Stok",
    lastPurchasePrice: "Harga Beli",
    category: "Kategori",
    unit: "Satuan",
    defaultBrandName: "Merk",
    preferredPurchaseQuantity: "Qty Pesan",
    preferredPurchaseUnit: "Unit Beli",
    netWeight: "Net Weight",
    conversionFactor: "Faktor Konversi",
  };

  const renderStepContent = () => {
    switch (step) {
      /* ═══════ UPLOAD ═══════ */
      case "upload":
        return (
          <div className="flex flex-col items-center gap-5 py-4">
            <div
              className={`flex h-40 w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-colors ${
                dragOver
                  ? "border-blue-400 bg-blue-50"
                  : "border-border bg-muted/30 hover:border-blue-300 hover:bg-blue-50/50"
              }`}
              onDragLeave={() => setDragOver(false)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f) parseFile(f);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">
                Klik atau drag & drop file Excel
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground/70">
                .xlsx, .xls, atau .csv
              </p>
            </div>
            <input
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) parseFile(f);
              }}
              ref={fileInputRef}
              type="file"
            />

            <button
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                downloadTemplate();
              }}
              type="button"
            >
              <Download className="h-3.5 w-3.5" />
              Download template Excel
            </button>
          </div>
        );

      /* ═══════ PREVIEW ═══════ */
      case "preview":
        return (
          <div className="space-y-3">
            {/* Summary */}
            <div className="flex gap-3 text-[11px] font-medium">
              <span className="rounded-md bg-green-100 px-2 py-1 text-green-800">
                {importRows.length} baris terbaca
              </span>
              <span className="rounded-md bg-blue-100 px-2 py-1 text-blue-800">
                {matchedCount} cocok
              </span>
              {unmatchedCount > 0 && (
                <span className="rounded-md bg-amber-100 px-2 py-1 text-amber-800">
                  {unmatchedCount} tidak cocok
                </span>
              )}
              <span className="rounded-md bg-indigo-100 px-2 py-1 text-indigo-800">
                {withChanges} dengan perubahan
              </span>
            </div>

            {/* Table */}
            <div className="max-h-80 overflow-auto rounded-lg border border-border">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-muted/50 text-left text-[10px] font-semibold uppercase text-muted-foreground">
                    <th className="sticky top-0 bg-muted/95 px-2 py-1.5">#</th>
                    <th className="sticky top-0 bg-muted/95 px-2 py-1.5">Nama</th>
                    <th className="sticky top-0 bg-muted/95 px-2 py-1.5">Status</th>
                    <th className="sticky top-0 bg-muted/95 px-2 py-1.5">Perubahan</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.slice(0, 100).map((row) => {
                    const changeFields = Object.keys(row.changes);
                    const changeLabels = changeFields
                      .map((f) => fieldLabel[f] ?? f)
                      .join(", ");
                    return (
                      <tr
                        key={row.rowIndex}
                        className="border-t border-border/50 hover:bg-muted/30"
                      >
                        <td className="px-2 py-1 text-muted-foreground">
                          {row.rowIndex}
                        </td>
                        <td className="max-w-[160px] truncate px-2 py-1 font-medium">
                          {row.ingredientName}
                        </td>
                        <td className="px-2 py-1">
                          {row.matched ? (
                            <span className="inline-flex items-center gap-0.5 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                              <Check className="h-2.5 w-2.5" />
                              Cocok
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              <AlertCircle className="h-2.5 w-2.5" />
                              Baru
                            </span>
                          )}
                        </td>
                        <td className="max-w-[200px] truncate px-2 py-1 text-muted-foreground">
                          {changeLabels || (
                            <span className="italic text-muted-foreground/50">
                              Tidak ada perubahan
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {importRows.length > 100 && (
                    <tr className="border-t border-border/50">
                      <td
                        className="px-2 py-2 text-center text-muted-foreground italic"
                        colSpan={4}
                      >
                        +{importRows.length - 100} baris lainnya (ditampilkan
                        100 pertama)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {unmatchedCount > 0 && (
              <p className="text-[10px] text-amber-600">
                <AlertCircle className="h-4 w-4" aria-hidden="true" /> {unmatchedCount} bahan tidak ditemukan di inventory. Item baru
                belum didukung — data tersebut akan dilewati.
              </p>
            )}
          </div>
        );

      /* ═══════ IMPORTING ═══════ */
      case "importing":
        return (
          <div className="flex flex-col items-center gap-4 py-6">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm font-medium">
              Mengupdate inventory...
            </p>
            <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{
                  width: `${(progress.current / Math.max(progress.total, 1)) * 100}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {progress.current} / {progress.total} item
              {progress.errors > 0 && (
                <span className="ml-1 text-destructive">
                  ({progress.errors} gagal)
                </span>
              )}
            </p>
          </div>
        );

      /* ═══════ DONE ═══════ */
      case "done":
        const success = progress.total - progress.errors;
        return (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
              <Check className="h-7 w-7" />
            </div>
            <p className="text-sm font-bold">Import Selesai</p>
            <p className="text-xs text-muted-foreground">
              {success} item berhasil diupdate, {progress.errors} gagal
            </p>
          </div>
        );
    }
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          data-slot="confirmation-modal-root"
        >
          {/* Backdrop */}
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-md"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal Card */}
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-2xl"
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
          >
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-sm tracking-tight">
                  Import Inventory
                </h3>
              </div>
              <button
                className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted"
                onClick={onClose}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Step indicator */}
            <div className="mb-4 flex items-center gap-1">
              {(["upload", "preview", "importing", "done"] as Step[]).map(
                (s, idx) => {
                  const stepIdx = ["upload", "preview", "importing", "done"];
                  const curIdx = stepIdx.indexOf(step);
                  const thisIdx = stepIdx.indexOf(s);
                  const done = thisIdx <= curIdx && step !== "importing";
                  return (
                    <div className="flex items-center gap-1" key={s}>
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                          done
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {done && step !== "importing" ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          idx + 1
                        )}
                      </div>
                      {idx < 3 && (
                        <div
                          className={`h-px w-6 ${
                            done ? "bg-primary" : "bg-muted"
                          }`}
                        />
                      )}
                    </div>
                  );
                }
              )}
            </div>

            {/* Body */}
            {renderStepContent()}

            {/* Actions */}
            <div className="mt-5 flex gap-2">
              {step === "upload" && (
                <button
                  className="flex-1 rounded-xl border border-border bg-background py-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wider transition-colors hover:bg-muted"
                  onClick={onClose}
                  type="button"
                >
                  Tutup
                </button>
              )}
              {step === "preview" && (
                <>
                  <button
                    className="flex-1 rounded-xl border border-border bg-background py-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wider transition-colors hover:bg-muted"
                    onClick={() => setStep("upload")}
                    type="button"
                  >
                    Kembali
                  </button>
                  <button
                    className={`flex-1 rounded-xl py-2.5 text-xs font-bold uppercase tracking-wider transition-all shadow-lg ${
                      withChanges === 0
                        ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                        : "bg-primary text-primary-foreground hover:brightness-110 active:scale-95"
                    }`}
                    disabled={withChanges === 0}
                    onClick={runImport}
                    type="button"
                  >
                    Import {withChanges} Perubahan
                  </button>
                </>
              )}
              {(step === "importing") && (
                <button
                  className="flex-1 cursor-not-allowed rounded-xl bg-muted py-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wider"
                  disabled
                  type="button"
                >
                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                  Mengimpor...
                </button>
              )}
              {step === "done" && (
                <button
                  className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground uppercase tracking-wider shadow-lg transition-all hover:brightness-110 active:scale-95"
                  onClick={() => {
                    onClose();
                  }}
                  type="button"
                >
                  Selesai
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof window === "undefined") return null;

  return createPortal(modalContent, document.body);
}
