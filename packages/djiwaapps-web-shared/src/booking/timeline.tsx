import type { ReactNode } from "react";

type TimelineEvent = {
  id?: string;
  event_type?: string;
  from_value?: string | null;
  to_value?: string | null;
};

type Delivery = {
  id?: string;
  channel?: string;
  status?: string;
};

export function BookingTimelineSummary({
  loading,
  timeline,
  deliveries,
  emptyLabel = "Belum ada event timeline.",
}: {
  loading: boolean;
  timeline: TimelineEvent[];
  deliveries: Delivery[];
  emptyLabel?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Timeline &amp; delivery
        </p>
        <span className="text-[10px] text-muted-foreground">
          {loading ? "Memuat..." : `${timeline.length} event · ${deliveries.length} delivery`}
        </span>
      </div>
      {!loading && timeline.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="space-y-1">
          {timeline.slice(0, 4).map((event, index) => (
            <div className="flex items-center justify-between gap-2 text-xs" key={event.id ?? `${event.event_type}-${index}`}>
              <span className="font-medium">{event.event_type ?? "Event"}</span>
              <span className="text-muted-foreground">{event.to_value ?? "—"}</span>
            </div>
          ))}
        </div>
      )}
      {deliveries.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {deliveries.slice(0, 6).map((delivery, index) => (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold" key={delivery.id ?? `${delivery.channel}-${index}`}>
              {delivery.channel ?? "internal"}: {delivery.status ?? "queued"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
