import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, getDay, isSameMonth, isSameDay, isToday } from "date-fns";
import { id } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarPlus, Download, Upload, CalendarDays, X, Clock, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  useHybridAttendanceSchedules,
  useHybridCreateAttendanceSchedule,
  useHybridBulkCreateAttendanceSchedules,
  useHybridUpdateAttendanceSchedule,
  useHybridDeleteAttendanceSchedule,
} from "@/hooks/use-hybrid-attendance-schedules";
import type { AttendanceSchedule, SchedulesByDate, CreateScheduleInput } from "@/hooks/use-hybrid-attendance-schedules";
import { useHybridStaffUsers } from "@/hooks/use-hybrid-pos-data";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent, DragOverEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const FULL_DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

type CalendarView = "month";

function formatDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

// ─── ShiftCard ────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  scheduled: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950",
  confirmed: "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950",
  completed: "text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-800",
  absent: "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950",
  cancelled: "text-muted-foreground bg-muted line-through",
};

// ─── Ghost Card (DragOverlay) ────────────────────────────────
function ShiftCardGhost({ schedule }: { schedule: AttendanceSchedule }) {
  return (
    <div className="rounded-md border-2 border-primary/50 bg-primary/10 px-2 py-1.5 text-xs shadow-xl rotate-2">
      <span className="font-medium">{schedule.userName}</span>
      <span className="ml-1 text-muted-foreground">— {schedule.shiftName}</span>
    </div>
  );
}

function ShiftCard({
  schedule,
  onEdit,
  onDelete,
}: {
  schedule: AttendanceSchedule;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: schedule._id,
    data: { schedule, type: "shift-card" },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 100 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative cursor-grab rounded-md border border-border/60 bg-card px-2 py-1 text-xs transition-all",
        "hover:border-primary/40 hover:shadow-sm",
        isDragging && "shadow-lg"
      )}
      onClick={onEdit}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-center gap-1">
        <span className="inline-block rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
          {schedule.roleName}
        </span>
        <span className="flex-1 truncate font-medium text-foreground">
          {schedule.userName}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Clock className="h-3 w-3 shrink-0" />
        <span>{schedule.shiftName}</span>
        {schedule.startTime && (
          <span>
            ({schedule.startTime}-{schedule.endTime ?? "?"})
          </span>
        )}
      </div>
      <div className="mt-0.5 flex items-center justify-between">
        <span
          className={cn(
            "inline-block rounded-full px-1.5 py-0.5 text-[9px] font-medium",
            statusColors[schedule.status]
          )}
        >
          ● {schedule.status}
        </span>
        <button
          className="hidden rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ─── DayColumn ────────────────────────────────────────────────

function DayColumn({
  date,
  dateStr,
  isToday,
  isCurrentMonth,
  schedules,
  onAdd,
  onEditSchedule,
  onDeleteSchedule,
  isDragOver,
}: {
  date: Date;
  dateStr: string;
  isToday: boolean;
  isCurrentMonth: boolean;
  schedules: AttendanceSchedule[];
  onAdd: (dateStr: string) => void;
  onEditSchedule: (s: AttendanceSchedule) => void;
  onDeleteSchedule: (id: string) => void;
  isDragOver?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${dateStr}`,
    data: { date: dateStr, type: "day-column" },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[100px] flex-col gap-0.5 rounded-lg border border-border/50 p-1.5 transition-colors",
        !isCurrentMonth && "opacity-40",
        isOver && "bg-primary/5 ring-2 ring-primary/30",
        isDragOver && !isOver && "bg-muted/50"
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
            isToday && "bg-primary text-primary-foreground"
          )}
        >
          {format(date, "d")}
        </span>
        <button
          className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100"
          onClick={() => onAdd(dateStr)}
          title="Tambah jadwal"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      <div className="flex flex-col gap-0.5">
        {schedules.map((s) => (
          <ShiftCard
            key={s._id}
            schedule={s}
            onEdit={() => onEditSchedule(s)}
            onDelete={() => onDeleteSchedule(s._id)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── CalendarHeader ──────────────────────────────────────────

function CalendarHeader({
  currentDate,
  onPrev,
  onNext,
  onToday,
  onAdd,
  onImport,
  onExport,
}: {
  currentDate: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onAdd: () => void;
  onImport: () => void;
  onExport: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h2 className="font-bold text-lg tracking-tight md:text-2xl">
          {format(currentDate, "MMMM yyyy", { locale: id })}
        </h2>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" onClick={onPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={onToday}>
          Hari Ini
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="default" size="sm" onClick={onAdd}>
          <CalendarPlus className="mr-1 h-4 w-4" /> Tambah
        </Button>
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="mr-1 h-4 w-4" /> Export
        </Button>
        <Button variant="outline" size="sm" onClick={onImport}>
          <Upload className="mr-1 h-4 w-4" /> Import
        </Button>
      </div>
    </div>
  );
}

// ─── QuickAddPanel ────────────────────────────────────────────

type PanelMode = "create" | "edit";

function QuickAddPanel({
  open,
  mode,
  defaultDate,
  editSchedule,
  users,
  shiftTemplates,
  onClose,
  onSave,
  onUpdate,
}: {
  open: boolean;
  mode: PanelMode;
  defaultDate?: string;
  editSchedule?: AttendanceSchedule;
  users: { _id: string; name: string; roleName: string }[];
  shiftTemplates: { name: string; openTime?: string; closeTime?: string }[];
  onClose: () => void;
  onSave: (input: CreateScheduleInput) => Promise<void>;
  onUpdate: (id: string, changes: Partial<CreateScheduleInput>) => Promise<void>;
}) {
  const [date, setDate] = useState(editSchedule?.date ?? defaultDate ?? formatDateStr(new Date()));
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    editSchedule ? [editSchedule.userId] : []
  );
  const [shiftName, setShiftName] = useState(editSchedule?.shiftName ?? shiftTemplates[0]?.name ?? "");
  const [startTime, setStartTime] = useState(editSchedule?.startTime ?? "");
  const [endTime, setEndTime] = useState(editSchedule?.endTime ?? "");
  const [note, setNote] = useState(editSchedule?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (open && !editSchedule) {
      setSelectedUserIds([]);
      setShiftName(shiftTemplates[0]?.name ?? "");
      setStartTime("");
      setEndTime("");
      setNote("");
      setSearchQuery("");
    }
    if (open && editSchedule) {
      setDate(editSchedule.date);
      setSelectedUserIds([editSchedule.userId]);
      setShiftName(editSchedule.shiftName);
      setStartTime(editSchedule.startTime ?? "");
      setEndTime(editSchedule.endTime ?? "");
      setNote(editSchedule.note ?? "");
    }
  }, [open, editSchedule, shiftTemplates]);

  // Auto-fill times when shift changes
  useEffect(() => {
    const template = shiftTemplates.find((t) => t.name === shiftName);
    if (template) {
      if (!editSchedule || !editSchedule.startTime) {
        setStartTime(template.openTime ?? "");
      }
      if (!editSchedule || !editSchedule.endTime) {
        setEndTime(template.closeTime ?? "");
      }
    }
  }, [shiftName, shiftTemplates, editSchedule]);

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.roleName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSubmit = async () => {
    if (!date || selectedUserIds.length === 0) return;
    setSaving(true);
    try {
      if (mode === "edit" && editSchedule) {
        await onUpdate(editSchedule._id, {
          date,
          shiftName,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          note: note || undefined,
        });
      } else {
        for (const userId of selectedUserIds) {
          await onSave({
            userId,
            date,
            shiftName,
            startTime: startTime || undefined,
            endTime: endTime || undefined,
            note: note || undefined,
          });
        }
      }
      toast.success(mode === "edit" ? "Jadwal diupdate" : "Jadwal ditambahkan");
      onClose();
    } catch (err) {
      toast.error("Gagal menyimpan jadwal");
    } finally {
      setSaving(false);
    }
  };

  const selectAllByRole = (roleName: string) => {
    const roleUsers = users
      .filter((u) => u.roleName === roleName)
      .map((u) => u._id);
    setSelectedUserIds((prev) => {
      const allSelected = roleUsers.every((id) => prev.includes(id));
      if (allSelected) {
        return prev.filter((id) => !roleUsers.includes(id));
      }
      return [...new Set([...prev, ...roleUsers])];
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-background shadow-xl animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold">
            {mode === "edit" ? "Edit Jadwal" : "Tambah Jadwal"}
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-4 p-4">
          {/* Date */}
          <div>
            <label className="mb-1 block text-sm font-medium">Tanggal</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Shift */}
          <div>
            <label className="mb-1 block text-sm font-medium">Shift</label>
            <select
              value={shiftName}
              onChange={(e) => setShiftName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {shiftTemplates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}{" "}
                  {t.openTime && `(${t.openTime}-${t.closeTime ?? "?"})`}
                </option>
              ))}
              <option value="custom">Custom...</option>
            </select>
          </div>

          {/* Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Jam Mulai
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Jam Selesai
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Karyawan (multi-select) */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Karyawan
              {mode === "create" && (
                <span className="text-muted-foreground text-xs">
                  {" "}
                  (pilih satu atau lebih)
                </span>
              )}
            </label>
            <input
              type="text"
              placeholder="Cari karyawan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredUsers.slice(0, 30).map((u) => (
                <label
                  key={u._id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(u._id)}
                    onChange={() => toggleUser(u._id)}
                    className="rounded"
                  />
                  <span className="flex-1">{u.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {u.roleName}
                  </span>
                </label>
              ))}
            </div>
            {/* Quick select by role */}
            <div className="mt-2 flex flex-wrap gap-1">
              {Array.from(new Set(users.map((u) => u.roleName))).map(
                (role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => selectAllByRole(role)}
                    className="rounded-md border px-2 py-0.5 text-[11px] hover:bg-muted"
                  >
                    {role}
                  </button>
                )
              )}
            </div>
            {selectedUserIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {selectedUserIds.map((id) => {
                  const u = users.find((x) => x._id === id);
                  return u ? (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                    >
                      {u.name}
                      <button
                        onClick={() => toggleUser(id)}
                        className="hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ) : null;
                })}
              </div>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="mb-1 block text-sm font-medium">Catatan</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Opsional..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-4">
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={saving || !date || selectedUserIds.length === 0}
          >
            {saving
              ? "Menyimpan..."
              : mode === "edit"
                ? "Simpan Perubahan"
                : `Tambah (${selectedUserIds.length} karyawan)`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Import Dialog (simplified) ──────────────────────────────

function ImportDialog({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl bg-background p-6 shadow-xl">
        <h3 className="mb-4 font-semibold text-lg">Import Jadwal</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Paste teks jadwal dari spreadsheet/Excel atau upload file. AI akan
          otomatis memparse format apapun.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
          placeholder={`Contoh:\nTanggal | Nama | Shift\n1 Mei  | Budi | Pagi\n2 Mei  | Siti | Siang`}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            onClick={async () => {
              setImporting(true);
              try {
                await onImport(text);
                toast.success("Jadwal berhasil diimport!");
                onClose();
              } catch {
                toast.error("Gagal mengimport jadwal");
              } finally {
                setImporting(false);
              }
            }}
            disabled={!text.trim() || importing}
          >
            {importing ? "Memproses..." : "Import"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Export Dialog (simplified) ──────────────────────────────

function ExportDialog({
  open,
  onClose,
  onExport,
}: {
  open: boolean;
  onClose: () => void;
  onExport: () => Promise<void>;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-xl bg-background p-6 shadow-xl">
        <h3 className="mb-4 font-semibold text-lg">Export Jadwal</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Download jadwal bulan ini sebagai file Excel (.xlsx)
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={onExport}>Download Excel</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────

function AttendanceJadwalPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>("create");
  const [editSchedule, setEditSchedule] = useState<AttendanceSchedule | undefined>();
  const [panelDefaultDate, setPanelDefaultDate] = useState<string | undefined>();
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // DnD state
  const [activeDragSchedule, setActiveDragSchedule] = useState<AttendanceSchedule | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [isCtrlHeld, setIsCtrlHeld] = useState(false);

  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();

  const { data: schedulesByDate, isLoading } = useHybridAttendanceSchedules(
    month,
    year,
    refreshTrigger
  );
  const users = useHybridStaffUsers(refreshTrigger);
  const siteSettings = useHybridSiteSettings();
  const shiftTemplates =
    siteSettings?.shiftSettings?.shiftSchedules ?? [];

  const { create } = useHybridCreateAttendanceSchedule();
  const { update } = useHybridUpdateAttendanceSchedule();
  const { remove } = useHybridDeleteAttendanceSchedule();
  const { bulkCreate } = useHybridBulkCreateAttendanceSchedules();

  const filteredUsers = (users ?? [])
    .filter((u: any) => u.isActive !== false)
    .map((u: any) => ({
      _id: u._id,
      name: u.name ?? "",
      roleName: u.roleName ?? "-",
    }));

  const refresh = () => setRefreshTrigger((n) => n + 1);

  const findScheduleById = (id: string, grouped: SchedulesByDate): AttendanceSchedule | null => {
    for (const schedules of Object.values(grouped)) {
      const found = schedules.find(s => s._id === id);
      if (found) return found;
    }
    return null;
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Control") setIsCtrlHeld(true); };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === "Control") setIsCtrlHeld(false); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const schedule = findScheduleById(event.active.id as string, schedulesByDate ?? {});
    if (schedule) setActiveDragSchedule(schedule);
  }, [schedulesByDate]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragSchedule(null);
    setDragOverDate(null);

    if (!over) return;
    const scheduleId = active.id as string;
    const overId = over.id as string;
    const targetDate = overId.startsWith("day-") ? overId.replace("day-", "") : null;
    if (!targetDate || !targetDate.match(/^\d{4}-\d{2}-\d{2}$/)) return;

    const schedule = findScheduleById(scheduleId, schedulesByDate ?? {});
    if (!schedule) return;

    if (schedule.date === targetDate) return; // same day, noop

    if (isCtrlHeld) {
      // Duplicate mode
      handleSave({
        userId: schedule.userId,
        date: targetDate,
        shiftName: schedule.shiftName,
        startTime: schedule.startTime ?? undefined,
        endTime: schedule.endTime ?? undefined,
      }).then(refresh);
      toast.success("Jadwal diduplikasi");
    } else {
      // Move mode
      handleUpdate(scheduleId, { date: targetDate }).then(refresh);
      toast.success("Jadwal dipindahkan");
    }
  }, [schedulesByDate, isCtrlHeld]);

  // Calendar navigation
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const handlePrev = () => setCurrentDate((d) => subMonths(d, 1));
  const handleNext = () => setCurrentDate((d) => addMonths(d, 1));
  const handleToday = () => setCurrentDate(new Date());

  const handleAdd = (dateStr?: string) => {
    setPanelMode("create");
    setEditSchedule(undefined);
    setPanelDefaultDate(dateStr ?? formatDateStr(new Date()));
    setPanelOpen(true);
  };

  const handleEdit = (schedule: AttendanceSchedule) => {
    setPanelMode("edit");
    setEditSchedule(schedule);
    setPanelDefaultDate(schedule.date);
    setPanelOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await remove(id);
      toast.success("Jadwal dihapus");
      refresh();
    } catch {
      toast.error("Gagal menghapus jadwal");
    }
  };

  const handleSave = async (input: CreateScheduleInput) => {
    await create(input);
    refresh();
  };

  const handleUpdate = async (
    id: string,
    changes: Partial<CreateScheduleInput>
  ) => {
    await update(id, changes);
    refresh();
  };

  const handleImport = async (text: string) => {
    // Simple import: try to parse by lines
    // AI parsing will be handled via edge function in Phase 2
    const lines = text.trim().split("\n");
    const inputs: CreateScheduleInput[] = [];

    for (const line of lines) {
      const parts = line.split("|").map((p) => p.trim());
      if (parts.length >= 3) {
        // Format: Tanggal | Nama | Shift
        const dateMatch = parts[0].match(/(\d+)/);
        if (!dateMatch) continue;
        const day = parseInt(dateMatch[1]);
        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const userName = parts[1];
        const shiftName = parts[2];

        // Match user
        const user = filteredUsers.find((u: any) =>
          u.name.toLowerCase().includes(userName.toLowerCase())
        );
        if (!user) continue;

        inputs.push({
          userId: user._id,
          date: dateStr,
          shiftName,
          startTime: parts[3]?.match(/\d{2}:\d{2}/)?.[0] ?? undefined,
          endTime: parts[4]?.match(/\d{2}:\d{2}/)?.[0] ?? undefined,
        });
      }
    }

    if (inputs.length > 0) {
      await bulkCreate(inputs);
      refresh();
    } else {
      throw new Error("Format tidak dikenal. Gunakan format: Tanggal | Nama | Shift");
    }
  };

  const handleExport = async () => {
    try {
      const XLSX = await import("xlsx");
      const rows: unknown[][] = [
        [
          "Tanggal",
          "Hari",
          "Nama Karyawan",
          "Role",
          "Shift",
          "Jam Mulai",
          "Jam Selesai",
          "Status",
          "Catatan",
        ],
      ];

      const sortedDates = Object.entries(schedulesByDate ?? {}).sort();
      for (const [dateStr, schedules] of sortedDates) {
        const d = new Date(dateStr + "T00:00:00");
        const dayName = FULL_DAY_NAMES[getDay(d)];
        for (const s of schedules) {
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

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [
        { wch: 12 },
        { wch: 8 },
        { wch: 20 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 12 },
        { wch: 12 },
        { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Jadwal");
      XLSX.writeFile(
        wb,
        `Jadwal_Shift_${format(currentDate, "MMMM_yyyy", { locale: id })}.xlsx`
      );
      toast.success("Jadwal berhasil di-export");
      setExportOpen(false);
    } catch {
      toast.error("Gagal export Excel");
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
      {/* Page Header */}
      <div className="flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-primary" />
        <div>
          <h1 className="font-bold text-xl tracking-tight md:text-2xl">
            Jadwal Kehadiran
          </h1>
          <p className="text-sm text-muted-foreground">
            Kelola jadwal shift karyawan
          </p>
        </div>
      </div>

      {/* Calendar Header */}
      <CalendarHeader
        currentDate={currentDate}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onAdd={() => handleAdd()}
        onImport={() => setImportOpen(true)}
        onExport={() => setExportOpen(true)}
      />

      {/* Calendar Grid */}
      {isLoading ? (
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-7 gap-1.5 md:gap-2">
            {/* Day headers */}
            {DAY_NAMES.map((name) => (
              <div
                key={name}
                className="py-1 text-center text-xs font-semibold text-muted-foreground"
              >
                {name}
              </div>
            ))}

            {/* Day cells */}
            {days.map((day) => {
              const dateStr = formatDateStr(day);
              return (
                <DayColumn
                  key={dateStr}
                  date={day}
                  dateStr={dateStr}
                  isToday={isToday(day)}
                  isCurrentMonth={isSameMonth(day, currentDate)}
                  schedules={schedulesByDate?.[dateStr] ?? []}
                  onAdd={handleAdd}
                  onEditSchedule={handleEdit}
                  onDeleteSchedule={handleDelete}
                  isDragOver={dragOverDate === dateStr}
                />
              );
            })}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeDragSchedule ? (
              <ShiftCardGhost schedule={activeDragSchedule} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Empty state */}
      {!isLoading &&
        Object.keys(schedulesByDate ?? {}).length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <CalendarDays className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">
              Belum ada jadwal untuk bulan ini
            </p>
            <Button variant="default" onClick={() => handleAdd()}>
              <CalendarPlus className="mr-1 h-4 w-4" /> Buat Jadwal Sekarang
            </Button>
          </div>
        )}

      {/* Quick Add Panel */}
      <QuickAddPanel
        open={panelOpen}
        mode={panelMode}
        defaultDate={panelDefaultDate}
        editSchedule={editSchedule}
        users={filteredUsers}
        shiftTemplates={shiftTemplates}
        onClose={() => setPanelOpen(false)}
        onSave={handleSave}
        onUpdate={handleUpdate}
      />

      {/* Import Dialog */}
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />

      {/* Export Dialog */}
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onExport={handleExport}
      />
    </div>
  );
}

export const Route = createLazyFileRoute(
  "/admin/operational-team/attendance/jadwal" as any
)({
  component: AttendanceJadwalPage,
});
