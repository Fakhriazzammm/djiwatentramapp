type Props = {
  total: number;
  active: number;
  /** elapsed milliseconds of the active story, drives the fill animation */
  elapsed: number;
  /** total duration in milliseconds the fill should span (default 15000) */
  durationMs?: number;
};

/**
 * Instagram-style segmented progress. Segments before `active` are full, the
 * active segment fills over `durationMs`, and segments after are empty.
 * Driven by `elapsed` so it stays in sync with the auto-advance timer.
 */
export function StoryProgress({ total, active, elapsed, durationMs = 15000 }: Props) {
  const safeTotal = Math.max(total, 1);
  const activePct = durationMs > 0 ? Math.min(100, (elapsed / durationMs) * 100) : 0;

  return (
    <div className="flex gap-1" aria-label={`Story ${active + 1} dari ${safeTotal}`}>
      {Array.from({ length: safeTotal }, (_, index) => {
        const width = index < active ? 100 : index === active ? activePct : 0;
        return (
          <span
            key={index}
            className={`h-[3px] flex-1 overflow-hidden rounded-full ${index === active || index < active ? "bg-white/40" : "bg-white/20"}`}
          >
            <span
              className="block h-full rounded-full bg-white transition-[width] duration-200 ease-linear"
              style={{ width: `${width}%` }}
            />
          </span>
        );
      })}
    </div>
  );
}
