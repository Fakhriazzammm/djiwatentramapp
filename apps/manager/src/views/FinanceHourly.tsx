import { Fragment, useMemo, useState, type ReactNode } from "react";
import { CH } from "../charts";
import { Empty, Panel, Tabs, rp } from "../ui";
import {
  buildHeatmapTotals,
  confidenceForSampleDays,
  CONFIDENCE_LABEL,
  DOW_LABELS,
  DOW_LONG,
  heatIntensity,
  metricValue,
  topDays,
  topHours,
  type Confidence,
  type HeatCell,
  type HeatmapPayload,
  type Metric,
} from "../lib/analytics";

type View = "chart" | "heatmap" | "hours" | "days";

const METRIC_TABS: [Metric, string][] = [["orders", "Order"], ["revenue", "Revenue"]];
const VIEW_TABS: [View, string][] = [
  ["chart", "Chart"],
  ["heatmap", "Heatmap"],
  ["hours", "Jam teratas"],
  ["days", "Hari teratas"],
];
const CONF_TONE: Record<Confidence, string> = {
  insufficient: "hi",
  daily: "md",
  medium: "ai",
  high: "ok",
};

const pad2 = (value: number) => String(value).padStart(2, "0");
const hourRange = (hour: number) => `${pad2(hour)}.00–${pad2((hour + 1) % 24)}.00`;

export function FinanceHourly({ heatmap, periodLabel }: { heatmap: HeatmapPayload; periodLabel: string }) {
  const [metric, setMetric] = useState<Metric>("orders");
  const [view, setView] = useState<View>("chart");
  const [selected, setSelected] = useState<HeatCell | null>(null);
  const { hours, days, grid } = useMemo(() => buildHeatmapTotals(heatmap.cells), [heatmap.cells]);
  const peak = topHours(hours, metric, 1)[0];
  const quiet = hours
    .filter((hour) => metricValue(hour, metric) > 0)
    .sort((a, b) => metricValue(a, metric) - metricValue(b, metric))[0];
  const totalOrders = hours.reduce((sum, hour) => sum + hour.orders, 0);
  const totalRevenue = hours.reduce((sum, hour) => sum + hour.revenue, 0);
  const maxHour = Math.max(...hours.map((hour) => metricValue(hour, metric)), 1);
  const cellMax = Math.max(...heatmap.cells.map((cell) => metricValue(cell, metric)), 1);
  const confidence = confidenceForSampleDays(heatmap.sampleDays);

  return (
    <Panel
      title={<span>Analisa jam operasional <span className="meta" style={{ marginLeft: 8 }}>{periodLabel} · WIB</span></span>}
      action={
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <Tabs items={METRIC_TABS} value={metric} onChange={setMetric} style={{ margin: 0 }} />
          <Tabs items={VIEW_TABS} value={view} onChange={setView} style={{ margin: 0 }} />
        </div>
      }
    >
      <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span className="meta">{heatmap.sampleDays} hari berisi transaksi settled</span>
          <span className={`tg ${CONF_TONE[confidence]}`}>{CONFIDENCE_LABEL[confidence]}</span>
        </div>

        {heatmap.cells.length === 0 ? (
          <Empty>BELUM ADA TRANSAKSI SETTLED PADA PERIODE INI</Empty>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 1, background: "var(--line)", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
              <Summary label="Jam ramai" accent background="#fff8e6" value={peak ? hourRange(peak.hour) : "—"}>
                {peak ? <>{peak.orders} order · {rp(peak.revenue)}{totalOrders > 0 ? ` · ${Math.round((peak.orders / totalOrders) * 100)}% order` : ""}</> : "belum ada data"}
              </Summary>
              <Summary label="Ringkasan periode" value={`${totalOrders} order`}>
                {rp(totalRevenue)} total settled
              </Summary>
              <Summary label="Jam tersepi" value={quiet ? hourRange(quiet.hour) : "—"}>
                {quiet ? <>{quiet.orders} order · {rp(quiet.revenue)}</> : "belum ada data"}
              </Summary>
            </div>

            {view === "chart" && <HourChart hours={hours} metric={metric} maxValue={maxHour} peakHour={peak?.hour ?? -1} />}
            {view === "heatmap" && <Heatmap grid={grid} metric={metric} cellMax={cellMax} selected={selected} onSelect={setSelected} />}
            {view === "hours" && <TopList items={topHours(hours, metric, 5)} metric={metric} maxValue={maxHour} title={(item) => hourRange(item.hour)} rowKey={(item) => item.hour} />}
            {view === "days" && <TopList items={topDays(days, metric)} metric={metric} maxValue={Math.max(...days.map((day) => metricValue(day, metric)), 1)} title={(item) => DOW_LONG[item.dow - 1]} rowKey={(item) => item.dow} />}

            <p className="meta" style={{ lineHeight: 1.6, margin: 0 }}>
              Pola jam dihitung dari transaksi settled (paid/completed) dalam WIB. Keyakinan naik seiring jumlah hari yang berisi transaksi.
            </p>
          </>
        )}
      </div>
    </Panel>
  );
}

function Summary({ label, value, children, accent = false, background }: { label: string; value: string; children: ReactNode; accent?: boolean; background?: string }) {
  return (
    <div style={{ background: background ?? "#fff", padding: "12px 14px", minWidth: 0 }}>
      <div className="meta" style={{ color: accent ? "var(--warn)" : "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</div>
      <div style={{ font: "600 20px var(--mono)", letterSpacing: "-.02em", marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      <div className="meta" style={{ marginTop: 5 }}>{children}</div>
    </div>
  );
}

function HourChart({ hours, metric, maxValue, peakHour }: { hours: { hour: number; orders: number; revenue: number }[]; metric: Metric; maxValue: number; peakHour: number }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 640 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 210, borderBottom: "1px solid var(--line)", paddingBottom: 2 }}>
          {hours.map((hour) => {
            const value = metricValue(hour, metric);
            const isPeak = hour.hour === peakHour && value > 0;
            return (
              <div
                key={hour.hour}
                title={`${hourRange(hour.hour)}: ${metric === "orders" ? `${hour.orders} order` : rp(hour.revenue)}`}
                style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
              >
                <div style={{ width: "100%", maxWidth: 40, height: value > 0 ? `${Math.max(2, (value / maxValue) * 100)}%` : 0, background: isPeak ? CH.amber : CH.blue, borderRadius: 3, transition: "height .45s var(--ease)" }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
          {hours.map((hour) => (
            <span key={hour.hour} className="meta" style={{ flex: 1, textAlign: "center" }}>{hour.hour % 2 === 0 ? pad2(hour.hour) : ""}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Heatmap({ grid, metric, cellMax, selected, onSelect }: { grid: Map<string, HeatCell>; metric: Metric; cellMax: number; selected: HeatCell | null; onSelect: (cell: HeatCell | null) => void }) {
  const rgb = metric === "orders" ? "26,93,198" : "217,154,0";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 760 }}>
          <div style={{ display: "grid", gridTemplateColumns: "42px repeat(24,minmax(0,1fr))", gap: 3 }}>
            <div aria-hidden="true" />
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} aria-hidden="true" className="meta" style={{ textAlign: "center" }}>{hour % 3 === 0 ? pad2(hour) : ""}</div>
            ))}
            {DOW_LABELS.map((label, index) => {
              const dow = index + 1;
              return (
                <Fragment key={dow}>
                  <div className="meta" style={{ display: "flex", alignItems: "center" }}>{label}</div>
                  {Array.from({ length: 24 }, (_, hour) => {
                    const cell = grid.get(`${dow}-${hour}`);
                    const value = cell ? metricValue(cell, metric) : 0;
                    const alpha = value > 0 ? 0.12 + 0.88 * heatIntensity(value, cellMax) : 0;
                    const active = selected?.dow === dow && selected?.hour === hour;
                    const description = `${DOW_LONG[index]} ${hourRange(hour)}: ${cell?.orders ?? 0} order, ${rp(cell?.revenue ?? 0)}`;
                    return (
                      <button
                        key={hour}
                        type="button"
                        aria-label={description}
                        aria-pressed={active}
                        title={description}
                        onClick={() => onSelect(cell ?? { dow, hour, orders: 0, revenue: 0 })}
                        style={{
                          aspectRatio: "1 / 1",
                          minHeight: 22,
                          width: "100%",
                          padding: 0,
                          border: active ? "2px solid var(--ink)" : "1px solid transparent",
                          borderRadius: 3,
                          background: value > 0 ? `rgba(${rgb},${alpha})` : "#f3f3f6",
                          cursor: "pointer",
                          transition: "transform .15s var(--ease), opacity .3s",
                        }}
                      />
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>
      <div className="meta" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, border: "1px solid var(--line)", background: "#fafafb", borderRadius: 6, padding: "8px 10px" }}>
        {selected ? (
          <>
            <span><b>{DOW_LONG[selected.dow - 1]} · {hourRange(selected.hour)}</b></span>
            <span>{selected.orders} order · {rp(selected.revenue)}</span>
            <button type="button" className="btn s" onClick={() => onSelect(null)}>Tutup</button>
          </>
        ) : (
          <span>Klik sel untuk melihat detail hari dan jam. Warna makin pekat berarti makin ramai.</span>
        )}
      </div>
    </div>
  );
}

function TopList<T extends { orders: number; revenue: number }>({ items, metric, maxValue, title, rowKey }: { items: T[]; metric: Metric; maxValue: number; title: (item: T) => string; rowKey: (item: T) => string | number }) {
  if (items.length === 0) return <Empty>BELUM ADA DATA PADA PERIODE INI</Empty>;
  return (
    <div>
      {items.map((item, index) => {
        const ratio = metricValue(item, metric) / maxValue;
        return (
          <div key={rowKey(item)} style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr) auto", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <span className="meta" style={{ fontWeight: 600 }}>{index + 1}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <b style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title(item)}</b>
                <span className="meta" style={{ whiteSpace: "nowrap" }}>{item.orders} order</span>
              </div>
              <div style={{ height: 6, background: "#ececf0", borderRadius: 3, overflow: "hidden", marginTop: 6 }}>
                <div style={{ width: `${Math.max(2, ratio * 100)}%`, height: "100%", background: index === 0 ? CH.amber : CH.blue, borderRadius: 3 }} />
              </div>
            </div>
            <span className="meta" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{rp(item.revenue)}</span>
          </div>
        );
      })}
    </div>
  );
}
