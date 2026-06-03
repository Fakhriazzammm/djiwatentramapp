import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useMemo, memo, useEffect } from "react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, getDay, isSameMonth, isSameDay, isToday } from "date-fns";
import { id } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarPlus, Download, Upload, CalendarDays, X, Clock, Plus } from "lucide-react";
import { toast } from "sonner";
import { withSaveToast } from "@/lib/with-save-toast";
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

import AttendanceImportDialog from "@/components/attendance/AttendanceImportDialog";
import AttendanceExportDialog from "@/components/attendance/AttendanceExportDialog";
import { useHybridBulkReplaceAttendanceSchedules } from "@/hooks/use-hybrid-attendance-schedules";
import type { ResolvedImportRow, ImportOptions } from "@/lib/attendance-schedule-import";

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const FULL_DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

type ScheduleViewMode = "calendar" | "matrix";

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
  off: "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-950/60",
};

// ─── Ghost Card (DragOverlay) ────────────────────────────────
const ShiftCardGhost = memo(function ShiftCardGhost({ schedule }: { schedule: AttendanceSchedule }) {
  return (
    <div className="rounded-md border-2 border-primary/50 bg-primary/10 px-2 py-1.5 text-xs shadow-xl rotate-2">
      <span className="font-medium">{schedule.userName}</span>
      <span className="ml-1 text-muted-foreground">— {schedule.shiftName}</span>
    </div>
  );
});

const ShiftCard = memo(function ShiftCard({
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
        "group relative cursor-grab rounded border border-border/60 bg-card px-1.5 py-1 text-[10px] leading-tight transition-all",
        "hover:border-primary/40 hover:shadow-sm",
        isDragging && "shadow-lg"
      )}
      onClick={onEdit}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-center gap-1">
        <span className="inline-block max-w-[48px] truncate rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
          {schedule.roleName}
        </span>
        <span className="flex-1 truncate font-medium text-foreground">
          {schedule.userName}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-0.5 truncate text-[9px] text-muted-foreground">
        <Clock className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate">{schedule.shiftName}</span>
        {schedule.startTime && (
          <span className="shrink-0">
            ({schedule.startTime}-{schedule.endTime ?? "?"})
          </span>
        )}
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-1">
        <span
          className={cn(
            "inline-block truncate rounded-full px-1 py-0.5 text-[8px] font-medium",
            statusColors[schedule.status]
          )}
        >
          ● {schedule.status}
        </span>
        <button
          className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block"
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
});

// ─── Shift color indicators ──────────────────────────────────

const SHIFT_DOT_COLORS: Record<string, string> = {
  PAGI: "bg-emerald-500",
  SORE: "bg-sky-600",
  OFF: "bg-rose-500",
  GENERAL: "bg-slate-500",
};

function getDayShiftLabels(schedules: AttendanceSchedule[]): string[] {
  const labels = new Set<string>();
  for (const s of schedules) {
    const shift = s.shiftName.toLowerCase();
    if (s.status === "off" || shift === "off") labels.add("OFF");
    else if (shift.includes("pagi")) labels.add("PAGI");
    else if (shift.includes("sore")) labels.add("SORE");
    else if (shift.includes("general")) labels.add("GENERAL");
  }
  // Maintain consistent order
  return ["PAGI", "SORE", "GENERAL", "OFF"].filter((l) => labels.has(l));
}

// ─── DayColumn ────────────────────────────────────────────────

const DayColumn = memo(function DayColumn({
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

  const shiftLabels = useMemo(() => getDayShiftLabels(schedules), [schedules]);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group flex min-h-[76px] flex-col gap-0.5 rounded-md border border-border/50 bg-background/70 p-1 transition-colors sm:min-h-[86px] md:min-h-[92px]",
        !isCurrentMonth && "opacity-40",
        isOver && "bg-primary/5 ring-2 ring-primary/30",
        isDragOver && !isOver && "bg-muted/50"
      )}
    >
      <div className="mb-0.5 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium",
              isToday && "bg-primary text-primary-foreground"
            )}
          >
            {format(date, "d")}
          </span>
          {shiftLabels.length > 0 && (
            <div className="flex items-center gap-[2px]">
              {shiftLabels.map((label) => (
                <span
                  key={label}
                  className={cn(
                    "inline-block h-1.5 w-1.5 rounded-full",
                    SHIFT_DOT_COLORS[label] ?? "bg-muted-foreground"
                  )}
                  title={label}
                />
              ))}
            </div>
          )}
        </div>
        <button
          className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100"
          onClick={() => onAdd(dateStr)}
          title="Tambah jadwal"
        >
          <Plus className="h-2.5 w-2.5" />
        </button>
      </div>
      <div className="flex flex-col gap-0.5 overflow-hidden">
        {schedules.slice(0, 2).map((s) => (
          <ShiftCard
            key={s._id}
            schedule={s}
            onEdit={() => onEditSchedule(s)}
            onDelete={() => onDeleteSchedule(s._id)}
          />
        ))}
        {schedules.length > 2 && (
          <button
            className="rounded bg-muted/70 px-1 py-0.5 text-left text-[9px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => onAdd(dateStr)}
            title="Lihat/tambah jadwal"
          >
            +{schedules.length - 2} jadwal
          </button>
        )}
      </div>
    </div>
  );
});

// ─── Roster Matrix ──────────────────────────────────────────

function getRosterLabel(schedule?: AttendanceSchedule): string {
  if (!schedule) return "-";
  const shift = schedule.shiftName.toLowerCase();
  if (schedule.status === "off" || shift === "off") return "OFF";
  if (shift.includes("pagi")) return "PAGI";
  if (shift.includes("sore")) return "SORE";
  if (shift.includes("general")) return "GENERAL";
  return schedule.shiftName.toUpperCase();
}

function getRosterCellClass(schedule?: AttendanceSchedule): string {
  const label = getRosterLabel(schedule);
  if (label === "PAGI") return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200";
  if (label === "SORE") return "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-200";
  if (label === "OFF") return "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-200";
  if (label === "GENERAL") return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200";
  return "bg-muted text-muted-foreground border-border";
}

// ─── MatrixCell ────────────────────────────────────────────

const MatrixCell = memo(function MatrixCell({
  dateStr,
  userId,
  userName,
  schedule,
  onEdit,
  onDelete,
  onAdd,
  isWeekStart,
}: {
  dateStr: string;
  userId: string;
  userName: string;
  schedule?: AttendanceSchedule;
  onEdit: () => void;
  onDelete: () => void;
  onAdd: () => void;
  isWeekStart: boolean;
}) {
  const droppableId = `cell-${dateStr}-${userId}`;
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: droppableId,
    data: { date: dateStr, userId, type: "matrix-cell" },
  });

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: schedule?._id ?? `empty-${droppableId}`,
    data: { schedule, type: "shift-card" },
    disabled: !schedule,
  });

  const style = schedule
    ? {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.3 : 1,
        zIndex: isDragging ? 100 : "auto" as const,
      }
    : undefined;

  const ref = (node: HTMLButtonElement | null) => {
    setDropRef(node);
    if (schedule) setDragRef(node);
  };

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "relative min-h-7 border-r px-1 py-1 text-center font-semibold transition",
        getRosterCellClass(schedule),
        isWeekStart && "border-t-2 border-t-slate-900/60",
        isOver && "ring-2 ring-primary/50 bg-primary/5",
        isDragging && "shadow-lg",
        !schedule && "cursor-pointer hover:bg-muted/50"
      )}
      onClick={() => {
        if (schedule) onEdit();
        else onAdd();
      }}
      title={
        schedule
          ? `${userName} • ${schedule.shiftName} — Klik edit, drag pindahkan`
          : `${userName} — Klik tambah jadwal`
      }
      {...(schedule ? { ...listeners, ...attributes } : {})}
      style={style}
    >
      {getRosterLabel(schedule)}
      {schedule && (
        <button
          className="absolute -right-0.5 -top-0.5 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[8px] text-destructive-foreground hover:flex group-hover:flex"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Hapus jadwal"
        >
          ×
        </button>
      )}
    </button>
  );
});

const RosterMatrix = memo(function RosterMatrix({
  monthDays,
  schedulesByDate,
  users,
  onEditSchedule,
  onAdd,
  onDeleteSchedule,
}: {
  monthDays: Date[];
  schedulesByDate: SchedulesByDate;
  users: { _id: string; name: string; roleName: string }[];
  onEditSchedule: (s: AttendanceSchedule) => void;
  onAdd: (dateStr: string) => void;
  onDeleteSchedule: (id: string) => void;
}) {
  const scheduledUserIds = new Set<string>();
  for (const schedules of Object.values(schedulesByDate)) {
    for (const schedule of schedules) scheduledUserIds.add(schedule.userId);
  }

  const visibleUsers = users.filter((user) => scheduledUserIds.has(user._id));
  const missingUsers = Array.from(scheduledUserIds)
    .filter((userId) => !visibleUsers.some((user) => user._id === userId))
    .map((userId) => {
      const schedule = Object.values(schedulesByDate).flat().find((s) => s.userId === userId);
      return {
        _id: userId,
        name: (schedule?.userName ?? "Karyawan").trim(),
        roleName: (schedule?.roleName ?? "-").trim(),
      };
    });
  const matrixUsers = [...visibleUsers, ...missingUsers];

  if (matrixUsers.length === 0) {
    return null;
  }

  const columnCount = matrixUsers.length + 3;

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <div
        className="grid min-w-[980px] text-[10px] md:text-[11px]"
        style={{ gridTemplateColumns: `76px 64px 92px repeat(${matrixUsers.length}, minmax(92px, 1fr))` }}
      >
        <div className="sticky left-0 z-20 border-b border-r bg-muted/80 px-2 py-2 text-center font-semibold">
          Minggu
        </div>
        <div className="border-b border-r bg-muted/80 px-2 py-2 text-center font-semibold">
          Hari
        </div>
        <div className="border-b border-r bg-muted/80 px-2 py-2 text-center font-semibold">
          Tanggal
        </div>
        {matrixUsers.map((user) => (
          <div key={user._id} className="border-b border-r bg-muted/80 px-2 py-2 text-center">
            <div className="truncate font-semibold text-foreground" title={user.name}>
              {user.name}
            </div>
            <div className="truncate text-[9px] text-muted-foreground" title={user.roleName}>
              {user.roleName}
            </div>
          </div>
        ))}

        {monthDays.map((day, index) => {
          const dateStr = formatDateStr(day);
          const daySchedules = schedulesByDate[dateStr] ?? [];
          const isWeekStart = index % 7 === 0;
          const weekNumber = Math.floor(index / 7) + 1;

          return (
            <div key={dateStr} className="contents">
              <div
                className={cn(
                  "sticky left-0 z-10 border-r bg-background px-2 py-1.5 text-center font-semibold",
                  isWeekStart && "border-t-2 border-t-slate-900/60"
                )}
              >
                {isWeekStart ? `Minggu ${weekNumber}` : ""}
              </div>
              <div
                className={cn(
                  "border-r bg-background px-2 py-1.5 text-center font-medium",
                  isWeekStart && "border-t-2 border-t-slate-900/60"
                )}
              >
                {FULL_DAY_NAMES[getDay(day)]}
              </div>
              <div
                className={cn(
                  "border-r bg-background px-2 py-1.5 text-center text-muted-foreground",
                  isWeekStart && "border-t-2 border-t-slate-900/60"
                )}
              >
                {format(day, "d MMM", { locale: id })}
              </div>
              {matrixUsers.map((user) => {
                const schedule = daySchedules.find((item) => item.userId === user._id);
                return (
                  <MatrixCell
                    key={`${dateStr}-${user._id}`}
                    dateStr={dateStr}
                    userId={user._id}
                    userName={user.name}
                    schedule={schedule}
                    onEdit={() => schedule && onEditSchedule(schedule)}
                    onDelete={() => schedule && onDeleteSchedule(schedule._id)}
                    onAdd={() => onAdd(dateStr)}
                    isWeekStart={isWeekStart}
                  />
                );
              })}
            </div>
          );
        })}

        <div className="col-span-full border-t bg-muted/40 px-2 py-2 text-[10px] text-muted-foreground">
          {columnCount} kolom • Drag & drop untuk duplikat (Ctrl+drag = pindah). Klik untuk edit.
        </div>
      </div>
    </div>
  );
});

// ─── CalendarHeader ──────────────────────────────────────────

function CalendarHeader({
  currentDate,
  viewMode,
  onViewModeChange,
  onPrev,
  onNext,
  onToday,
  onAdd,
  onImport,
  onExport,
}: {
  currentDate: Date;
  viewMode: ScheduleViewMode;
  onViewModeChange: (mode: ScheduleViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onAdd: () => void;
  onImport: () => void;
  onExport: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-1.5">
        <h2 className="mr-1 font-semibold text-base tracking-tight md:text-xl">
          {format(currentDate, "MMMM yyyy", { locale: id })}
        </h2>
        <div className="flex items-center rounded-md border bg-background">
          <Button className="h-8 w-8" variant="ghost" size="icon" onClick={onPrev}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button className="h-8 w-8" variant="ghost" size="icon" onClick={onNext}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button className="h-8 px-2 text-xs" variant="outline" size="sm" onClick={onToday}>
          Hari Ini
        </Button>
        <div className="flex items-center rounded-md border bg-background p-0.5">
          <Button
            className="h-7 px-2 text-xs"
            variant={viewMode === "calendar" ? "default" : "ghost"}
            size="sm"
            onClick={() => onViewModeChange("calendar")}
          >
            Kalender
          </Button>
          <Button
            className="h-7 px-2 text-xs"
            variant={viewMode === "matrix" ? "default" : "ghost"}
            size="sm"
            onClick={() => onViewModeChange("matrix")}
          >
            Matrix
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button className="h-8 px-2 text-xs" variant="default" size="sm" onClick={onAdd}>
          <CalendarPlus className="mr-1 h-3.5 w-3.5" /> Tambah
        </Button>
        <Button className="h-8 px-2 text-xs" variant="outline" size="sm" onClick={onExport}>
          <Download className="mr-1 h-3.5 w-3.5" /> Export
        </Button>
        <Button className="h-8 px-2 text-xs" variant="outline" size="sm" onClick={onImport}>
          <Upload className="mr-1 h-3.5 w-3.5" /> Import
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
    const result = await withSaveToast(async () => {
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
    }, { success: mode === "edit" ? "Jadwal diupdate" : "Jadwal ditambahkan" });
    if (result.success) {
      onClose();
    }
    setSaving(false);
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

// ─── Import Dialog (replaced by AttendanceImportDialog component) ──

// ─── Export Dialog (replaced by AttendanceExportDialog component) ──

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
  const [viewMode, setViewMode] = useState<ScheduleViewMode>("matrix");

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
      name: (u.name ?? "").trim(),
      roleName: (u.roleName ?? "-").trim(),
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

    // Parse target: day-YYYY-MM-DD or cell-YYYY-MM-DD-userId
    let targetDate: string | null = null;
    let targetUserId: string | null = null;

    if (overId.startsWith("day-")) {
      targetDate = overId.replace("day-", "");
    } else if (overId.startsWith("cell-")) {
      const parts = overId.replace("cell-", "").split("-");
      if (parts.length >= 4) {
        targetDate = parts.slice(0, 3).join("-");
        targetUserId = parts.slice(3).join("-");
      } else {
        return;
      }
    }

    if (!targetDate || !targetDate.match(/^\d{4}-\d{2}-\d{2}$/)) return;

    const schedule = findScheduleById(scheduleId, schedulesByDate ?? {});
    if (!schedule) return;

    const sameDate = schedule.date === targetDate;
    const sameUser = schedule.userId === targetUserId;
    // For calendar drag (day-*), targetUserId is null → only date change, always different user
    const isCalendarDrag = targetUserId === null;

    // No change at all
    if (sameDate && sameUser) return;

    if (isCtrlHeld) {
      // Move mode (Ctrl = pindahkan, bukan duplikat)
      const changes: Partial<CreateScheduleInput> = {};
      if (!sameDate) changes.date = targetDate;
      if (!sameUser && targetUserId) changes.userId = targetUserId;
      withSaveToast(
        () => handleUpdate(scheduleId, changes),
        { success: "Jadwal dipindahkan" }
      );
    } else {
      // Duplicate default: selalu buat baru di target
      withSaveToast(
        () => handleSave({
          userId: targetUserId ?? schedule.userId,
          date: targetDate,
          shiftName: schedule.shiftName,
          startTime: schedule.startTime ?? undefined,
          endTime: schedule.endTime ?? undefined,
        }),
        { success: "Jadwal diduplikasi" }
      );
    }
  }, [schedulesByDate, isCtrlHeld]);

  // Calendar navigation — memoized to avoid recalculation on every render
  const monthStart = useMemo(() => startOfMonth(currentDate), [currentDate]);
  const monthEnd = useMemo(() => endOfMonth(currentDate), [currentDate]);
  const calStart = useMemo(() => startOfWeek(monthStart), [monthStart]);
  const calEnd = useMemo(() => endOfWeek(monthEnd), [monthEnd]);
  const days = useMemo(() => eachDayOfInterval({ start: calStart, end: calEnd }), [calStart, calEnd]);
  const monthDays = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart, monthEnd]);

  const handlePrev = useCallback(() => setCurrentDate((d) => subMonths(d, 1)), []);
  const handleNext = useCallback(() => setCurrentDate((d) => addMonths(d, 1)), []);
  const handleToday = useCallback(() => setCurrentDate(new Date()), []);

  const handleAdd = useCallback((dateStr?: string) => {
    setPanelMode("create");
    setEditSchedule(undefined);
    setPanelDefaultDate(dateStr ?? formatDateStr(new Date()));
    setPanelOpen(true);
  }, []);

  const handleEdit = useCallback((schedule: AttendanceSchedule) => {
    setPanelMode("edit");
    setEditSchedule(schedule);
    setPanelDefaultDate(schedule.date);
    setPanelOpen(true);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await remove(id);
      toast.success("Jadwal dihapus");
      refresh();
    } catch {
      toast.error("Gagal menghapus jadwal");
    }
  }, [remove]);

  const handleSave = useCallback(async (input: CreateScheduleInput) => {
    await create(input);
    refresh();
  }, [create]);

  const handleUpdate = useCallback(async (
    id: string,
    changes: Partial<CreateScheduleInput>
  ) => {
    await update(id, changes);
    refresh();
  }, [update]);

  const { bulkReplace } = useHybridBulkReplaceAttendanceSchedules();

  const handleNewImport = async (
    rows: ResolvedImportRow[],
    userIds: string[],
    startDate: string,
    endDate: string,
    options: ImportOptions
  ) => {
    try {
      if (options.mode === "replace") {
        await bulkReplace(rows, userIds, startDate, endDate);
      } else {
        await bulkCreate(rows);
      }
      refresh();
    } catch (err) {
      toast.error("Gagal import jadwal: " + (err instanceof Error ? err.message : "Unknown"));
      throw err;
    }
  };

  const handleExport = async () => {
    // Export is now handled inside AttendanceExportDialog component
    // The dialog calls exportRosterXlsx or exportFlatXlsx directly
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 p-3 md:p-4">
      {/* Page Header */}
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <div>
          <h1 className="font-semibold text-lg tracking-tight md:text-xl">
            Jadwal Kehadiran
          </h1>
          <p className="text-xs text-muted-foreground">
            Kelola jadwal shift karyawan
          </p>
        </div>
      </div>

      {/* Calendar Header */}
      <CalendarHeader
        currentDate={currentDate}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onAdd={() => handleAdd()}
        onImport={() => setImportOpen(true)}
        onExport={() => setExportOpen(true)}
      />

      {/* Jadwal Grid */}
      {isLoading ? (
        viewMode === "matrix" ? (
          <div className="h-72 animate-pulse rounded-lg border bg-muted" />
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 35 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-md bg-muted"
              />
            ))}
          </div>
        )
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {viewMode === "matrix" ? (
            <RosterMatrix
              monthDays={monthDays}
              schedulesByDate={schedulesByDate ?? {}}
              users={filteredUsers}
              onEditSchedule={handleEdit}
              onAdd={handleAdd}
              onDeleteSchedule={handleDelete}
            />
          ) : (
            <>
              <div className="overflow-x-auto pb-1">
                <div className="grid min-w-[760px] grid-cols-7 gap-1 md:min-w-0 md:gap-1.5">
                  {/* Day headers */}
                  {DAY_NAMES.map((name) => (
                    <div
                      key={name}
                      className="py-0.5 text-center text-[11px] font-semibold text-muted-foreground"
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
              </div>
            </>
          )}
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
      <AttendanceImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleNewImport}
        shiftTemplates={shiftTemplates}
        liveStaff={filteredUsers}
        month={month}
        year={year}
      />

      {/* Export Dialog */}
      <AttendanceExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        schedulesByDate={schedulesByDate ?? null}
        month={month}
        year={year}
        shiftTemplates={shiftTemplates}
      />
    </div>
  );
}

export const Route = createLazyFileRoute("/admin/operational-team/attendance/jadwal")({
  component: AttendanceJadwalPage,
});
