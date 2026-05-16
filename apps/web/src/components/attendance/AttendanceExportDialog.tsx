import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Download } from "lucide-react";
import { toast } from "sonner";
import type { SchedulesByDate } from "@/hooks/use-hybrid-attendance-schedules";
import type { ShiftSchedule } from "@/lib/attendance-schedule-import";
import { exportRosterXlsx, exportFlatXlsx } from "@/lib/attendance-schedule-export";

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
  const [format, setFormat] = useState<"matrix" | "flat">("matrix");
  const [includeOff, setIncludeOff] = useState(false);
  const [includeGeneral, setIncludeGeneral] = useState(true);

  const handleExport = async () => {
    if (!schedulesByDate) return;
    setExporting(true);

    try {
      if (format === "matrix") {
        await exportRosterXlsx(schedulesByDate, month, year, shiftTemplates, {
          includeOff,
          includeGeneral,
        });
        const monthNames = [
          "Januari", "Februari", "Maret", "April", "Mei", "Juni",
          "Juli", "Agustus", "September", "Oktober", "November", "Desember"
        ];
        toast.success(`Export format gambar: Jadwal_${monthNames[month - 1]}_${year}.xlsx`);
      } else {
        await exportFlatXlsx(schedulesByDate, month, year);
        toast.success("Export flat table berhasil");
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
            Download jadwal bulan ini sebagai file Excel
          </p>

          {/* Format selector */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Format Export</p>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30">
              <input
                type="radio"
                name="exportFormat"
                checked={format === "matrix"}
                onChange={() => setFormat("matrix")}
                className="h-4 w-4"
              />
              <div>
                <p className="text-sm font-medium">Excel — format gambar / roster matrix</p>
                <p className="text-xs text-muted-foreground">
                  Header bertingkat, warna shift, merged header seperti gambar template
                </p>
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30">
              <input
                type="radio"
                name="exportFormat"
                checked={format === "flat"}
                onChange={() => setFormat("flat")}
                className="h-4 w-4"
              />
              <div>
                <p className="text-sm font-medium">Excel — table flat</p>
                <p className="text-xs text-muted-foreground">
                  Baris per jadwal: Tanggal, Hari, Nama, Shift, Jam
                </p>
              </div>
            </label>
          </div>

          {/* Options */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Opsi Tambahan</p>
            {format === "matrix" && (
              <>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={includeOff}
                    onChange={(e) => setIncludeOff(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-sm">Sertakan OFF</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={includeGeneral}
                    onChange={(e) => setIncludeGeneral(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-sm">Sertakan GENERAL</span>
                </label>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={handleExport} disabled={exporting}>
            <Download className="mr-1 h-4 w-4" />
            {exporting ? "Mengexport..." : format === "matrix" ? "Download Excel (Matrix)" : "Download Excel (Flat)"}
          </Button>
        </div>
      </div>
    </div>
  );
}
