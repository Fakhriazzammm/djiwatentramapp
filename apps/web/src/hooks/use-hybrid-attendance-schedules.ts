import { useCallback, useState } from "react";
import { createClient } from "@/lib/client";
import { useSupabaseLiveValue } from "@/hooks/use-supabase-live-value";

export type AttendanceSchedule = {
  _id: string;
  userId: string;
  userName: string;
  userSlug: string;
  roleName: string;
  date: string;
  shiftName: string;
  startTime: string | null;
  endTime: string | null;
  status: "scheduled" | "confirmed" | "completed" | "absent" | "cancelled" | "off";
  note: string | null;
  createdAt: string;
  updatedAt: string;
  raw: Record<string, unknown>;
};

export type SchedulesByDate = Record<string, AttendanceSchedule[]>;

export type CreateScheduleInput = {
  userId: string;
  date: string;
  shiftName: string;
  startTime?: string;
  endTime?: string;
  note?: string;
  status?: AttendanceSchedule["status"];
  raw?: Record<string, unknown>;
};

export type UpdateScheduleInput = Partial<{
  date: string;
  userId: string;
  shiftName: string;
  startTime: string | null;
  endTime: string | null;
  status: AttendanceSchedule["status"];
  note: string | null;
}>;

// ─── Fetch ─────────────────────────────────────────────────

async function fetchAttendanceSchedules(
  month: number,
  year: number
): Promise<SchedulesByDate | null> {
  const supabase = createClient();
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("pos_attendance_schedules")
    .select("*")
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true })
    .order("shiftName", { ascending: true });

  if (error) throw error;

  const grouped: SchedulesByDate = {};
  for (const row of data ?? []) {
    const schedule = row as AttendanceSchedule;
    const dateStr = schedule.date;
    if (!grouped[dateStr]) grouped[dateStr] = [];
    grouped[dateStr].push(schedule);
  }
  return grouped;
}

export function useHybridAttendanceSchedules(
  month: number,
  year: number,
  refreshTrigger?: number
) {
  const data = useSupabaseLiveValue(
    `attendance-schedules-${year}-${month}`,
    () => fetchAttendanceSchedules(month, year),
    [month, year, refreshTrigger]
  );
  return {
    data,
    isLoading: data === undefined,
  };
}

// ─── Create Single ──────────────────────────────────────────

export function useHybridCreateAttendanceSchedule() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const create = useCallback(async (input: CreateScheduleInput) => {
    setIsLoading(true);
    setError(null);
    setIsSuccess(false);
    try {
      const supabase = createClient();
      const pos = supabase.schema("pos");
      const sourceId = crypto.randomUUID();
      const { error: dbError } = await pos.from("attendance_schedules").insert({
        source_id: sourceId,
        user_id: input.userId,
        date: input.date,
        shift_name: input.shiftName,
        start_time: input.startTime ?? null,
        end_time: input.endTime ?? null,
        note: input.note ?? null,
        status: "scheduled",
      });

      if (dbError) throw dbError;
      setIsSuccess(true);
      return sourceId;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Gagal membuat jadwal";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    create,
    isLoading,
    error,
    isSuccess,
    reset: () => {
      setError(null);
      setIsSuccess(false);
    },
  };
}

// ─── Batch Create ───────────────────────────────────────────

export function useHybridBulkCreateAttendanceSchedules() {
  const [progress, setProgress] = useState<{
    total: number;
    done: number;
    failed: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bulkCreate = useCallback(async (inputs: CreateScheduleInput[]) => {
    setProgress({ total: inputs.length, done: 0, failed: 0 });
    setError(null);
    try {
      const supabase = createClient();
      const pos = supabase.schema("pos");
      const records = inputs.map((i) => ({
        source_id: crypto.randomUUID(),
        user_id: i.userId,
        date: i.date,
        shift_name: i.shiftName,
        start_time: i.startTime ?? null,
        end_time: i.endTime ?? null,
        note: i.note ?? null,
        status: i.status ?? ("scheduled" as const),
        raw: i.raw ?? {},
      }));

      const { error: dbError } = await pos
        .from("attendance_schedules")
        .insert(records);

      if (dbError) throw dbError;

      setProgress({ total: inputs.length, done: inputs.length, failed: 0 });
      return inputs.length;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Gagal membuat jadwal massal";
      setError(message);
      throw err;
    }
  }, []);

  return { bulkCreate, progress, error };
}

// ─── Bulk Replace by Month + Users ───────────────────────────

export function useHybridBulkReplaceAttendanceSchedules() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bulkReplace = useCallback(
    async (
      inputs: CreateScheduleInput[],
      userIds: string[],
      startDate: string,
      endDate: string
    ): Promise<{ inserted: number; deleted: number }> => {
      setLoading(true);
      setError(null);
      try {
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

        // Insert new records
        if (inputs.length > 0) {
          const records = inputs.map((i) => ({
            source_id: crypto.randomUUID(),
            user_id: i.userId,
            date: i.date,
            shift_name: i.shiftName,
            start_time: i.startTime ?? null,
            end_time: i.endTime ?? null,
            note: i.note ?? null,
            status: i.status ?? "scheduled",
            raw: i.raw ?? {},
          }));

          const { error: dbError } = await pos
            .from("attendance_schedules")
            .insert(records);
          if (dbError) throw dbError;
        }

        return { inserted: inputs.length, deleted };
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Gagal replace jadwal";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { bulkReplace, loading, error };
}

// ─── Update ─────────────────────────────────────────────────

export function useHybridUpdateAttendanceSchedule() {
  const [isLoading, setIsLoading] = useState(false);

  const update = useCallback(
    async (scheduleId: string, changes: UpdateScheduleInput) => {
      setIsLoading(true);
      try {
        const supabase = createClient();
        const pos = supabase.schema("pos");
        const payload: Record<string, unknown> = {};
        if (changes.date !== undefined) payload.date = changes.date;
        if (changes.userId !== undefined)
          payload.user_id = changes.userId;
        if (changes.shiftName !== undefined)
          payload.shift_name = changes.shiftName;
        if (changes.startTime !== undefined)
          payload.start_time = changes.startTime;
        if (changes.endTime !== undefined) payload.end_time = changes.endTime;
        if (changes.status !== undefined) payload.status = changes.status;
        if (changes.note !== undefined) payload.note = changes.note;

        const { error: dbError } = await pos
          .from("attendance_schedules")
          .update(payload)
          .eq("source_id", scheduleId);

        if (dbError) throw dbError;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return { update, isLoading };
}

// ─── Delete ─────────────────────────────────────────────────

export function useHybridDeleteAttendanceSchedule() {
  const [isLoading, setIsLoading] = useState(false);

  const remove = useCallback(async (scheduleId: string) => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const pos = supabase.schema("pos");
      const { error } = await pos
        .from("attendance_schedules")
        .delete()
        .eq("source_id", scheduleId);
      if (error) throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { remove, isLoading };
}
