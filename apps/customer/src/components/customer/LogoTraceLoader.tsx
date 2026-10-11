import { useEffect, useRef, useState } from "react";

const LOGO_VIEW_BOX = "0 0 200 200";

/** Single continuous circular route traced while work is in progress. */
const TRACE_PATH = "M 100 31 A 69 69 0 1 1 99.999 169 A 69 69 0 1 1 100 31 Z";

/**
 * Filled Djiwa Tentram mark: the brand disc with the dove contour knocked out
 * (even-odd), so the mark stays recognizable through currentColor alone.
 * Dove contours traced from apps/customer/public/pwa-djiwa-512.png.
 */
const FILL_PATHS = [
  "M 100 31 A 69 69 0 1 1 99.999 169 A 69 69 0 1 1 100 31 Z M 74.17 90.93 Q 73.58 89.35 73.68 89.06 Q 73.78 88.76 75.16 89.16 Q 76.54 89.55 76.93 89.35 Q 77.33 89.16 75.06 87.19 Q 72.79 85.21 71.81 83.24 Q 70.82 81.27 70.82 80.29 Q 70.82 79.30 71.22 79.20 Q 71.61 79.10 73.68 80.29 Q 75.75 81.47 72.89 77.92 Q 70.03 74.37 69.44 72.60 Q 68.85 70.82 69.05 69.05 Q 69.25 67.27 69.84 67.37 Q 70.43 67.47 71.22 68.46 Q 72.01 69.44 73.09 70.03 Q 74.17 70.63 72.50 67.18 Q 70.82 63.73 70.72 61.26 Q 70.63 58.80 71.02 58.60 Q 71.41 58.40 76.05 63.53 Q 80.68 68.65 88.76 74.47 Q 96.85 80.29 99.80 85.81 Q 102.76 91.33 103.55 92.41 Q 104.34 93.49 105.52 94.38 Q 106.70 95.27 108.08 95.66 Q 109.46 96.06 111.04 95.86 Q 112.62 95.66 114.10 94.68 Q 115.57 93.69 117.05 91.92 Q 118.53 90.14 120.21 89.35 Q 121.88 88.57 124.05 88.76 Q 126.22 88.96 127.70 90.34 Q 129.18 91.72 130.16 92.21 Q 131.15 92.71 131.35 93.20 Q 131.54 93.69 129.97 94.48 Q 128.39 95.27 127.01 96.85 Q 125.63 98.42 123.36 104.73 Q 121.09 111.04 120.01 112.91 Q 118.93 114.79 117.35 116.46 Q 115.77 118.14 113.70 119.52 Q 111.63 120.90 109.96 121.59 Q 108.28 122.28 106.11 122.77 Q 103.94 123.26 98.82 123.46 Q 93.69 123.66 92.71 123.95 Q 91.72 124.25 91.72 124.64 Q 91.72 125.04 92.80 125.23 Q 93.89 125.43 93.99 126.02 Q 94.09 126.61 90.83 132.33 Q 87.58 138.05 86.00 138.15 Q 84.43 138.25 84.52 137.16 Q 84.62 136.08 84.33 135.98 Q 84.03 135.88 83.14 136.87 Q 82.26 137.85 81.37 138.05 Q 80.48 138.25 79.20 137.65 Q 77.92 137.06 78.81 135.29 Q 79.69 133.51 78.31 134.40 Q 76.93 135.29 76.05 135.39 Q 75.16 135.49 73.88 134.40 Q 72.60 133.32 72.60 132.82 Q 72.60 132.33 74.17 131.25 Q 75.75 130.16 75.75 129.77 Q 75.75 129.37 73.09 129.87 Q 70.43 130.36 69.64 129.57 Q 68.85 128.78 68.56 127.99 Q 68.26 127.21 76.15 123.16 Q 84.03 119.12 86.99 116.46 Q 89.95 113.80 90.93 112.12 Q 91.92 110.45 88.96 108.87 Q 86.00 107.29 85.12 106.31 Q 84.23 105.32 84.43 104.44 Q 84.62 103.55 83.54 103.15 Q 82.45 102.76 81.17 101.77 Q 79.89 100.79 79.10 99.51 Q 78.31 98.23 78.31 97.83 Q 78.31 97.44 79.00 96.94 Q 79.69 96.45 77.23 94.48 Q 74.77 92.51 74.17 90.93 Z M 111.93 78.12 Q 112.22 77.53 112.81 75.75 Q 113.41 73.98 114.29 72.99 Q 115.18 72.01 115.57 72.10 Q 115.97 72.20 116.17 72.70 Q 116.36 73.19 116.76 73.09 Q 117.15 72.99 117.64 71.02 Q 118.14 69.05 119.42 67.37 Q 120.70 65.70 121.78 66.39 Q 122.87 67.08 123.16 64.91 Q 123.46 62.74 124.45 61.16 Q 125.43 59.59 125.92 59.68 Q 126.42 59.78 126.91 61.46 Q 127.40 63.13 127.70 63.13 Q 127.99 63.13 128.29 60.28 Q 128.59 57.42 129.37 55.74 Q 130.16 54.07 130.66 53.97 Q 131.15 53.87 131.74 56.63 Q 132.33 59.39 132.33 62.25 Q 132.33 65.11 131.74 69.05 Q 131.15 72.99 130.16 75.95 Q 129.18 78.91 127.40 82.36 Q 125.63 85.81 125.14 86.20 Q 124.64 86.59 123.07 86.59 Q 121.49 86.59 119.62 87.38 Q 117.74 88.17 115.57 90.54 Q 113.41 92.90 112.52 93.40 Q 111.63 93.89 110.25 93.89 Q 108.87 93.89 107.98 93.49 Q 107.10 93.10 106.11 92.11 Q 105.13 91.13 104.73 89.85 Q 104.34 88.57 106.31 84.82 Q 108.28 81.07 109.46 79.99 Q 110.65 78.91 111.14 78.81 Q 111.63 78.71 111.93 78.12 Z",
] as const;

type LoaderPhase = "loop" | "closingOutline" | "fadingFill" | "done";

export type LogoTraceLoaderProps = {
  loading?: boolean;
  isComplete?: boolean;
  size?: number;
  strokeWidth?: number;
  loopDurationSeconds?: number;
  fillFadeSeconds?: number;
  className?: string;
  ariaLabel?: string;
  onDone?: () => void;
};

export function LogoTraceLoader({
  loading = true,
  isComplete = false,
  size = 96,
  strokeWidth = 3,
  loopDurationSeconds = 1.4,
  fillFadeSeconds = 0.35,
  className,
  ariaLabel = "Memuat Djiwa Tentram",
  onDone,
}: LogoTraceLoaderProps) {
  const [phase, setPhase] = useState<LoaderPhase>("loop");
  const doneCalledRef = useRef(false);

  useEffect(() => {
    if (loading && !isComplete) {
      doneCalledRef.current = false;
      setPhase("loop");
      return;
    }

    if (phase !== "loop") return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reducedMotion) {
      setPhase("done");
      if (!doneCalledRef.current) {
        doneCalledRef.current = true;
        onDone?.();
      }
      return;
    }

    setPhase("closingOutline");
    const closeTimer = window.setTimeout(
      () => setPhase("fadingFill"),
      Math.max(180, loopDurationSeconds * 250),
    );
    const doneTimer = window.setTimeout(
      () => {
        setPhase("done");
        if (!doneCalledRef.current) {
          doneCalledRef.current = true;
          onDone?.();
        }
      },
      Math.max(220, loopDurationSeconds * 250) + fillFadeSeconds * 1000,
    );

    return () => {
      window.clearTimeout(closeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [
    fillFadeSeconds,
    isComplete,
    loading,
    loopDurationSeconds,
    onDone,
    phase,
  ]);

  return (
    <svg
      role="status"
      aria-label={ariaLabel}
      viewBox={LOGO_VIEW_BOX}
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size }}
    >
      {FILL_PATHS.map((path) => (
        <path
          key={path}
          d={path}
          fill="currentColor"
          fillRule="evenodd"
          fillOpacity={phase === "fadingFill" || phase === "done" ? 1 : 0.55}
          style={{
            transition: `fill-opacity ${fillFadeSeconds}s ease-out`,
          }}
        />
      ))}

      {phase === "loop" || phase === "closingOutline" ? (
        <g opacity="0.18">
          <path
            d={TRACE_PATH}
            fill="none"
            stroke="currentColor"
            strokeWidth={Math.max(1, strokeWidth / 2)}
            strokeLinejoin="round"
          />
        </g>
      ) : null}

      {phase === "loop" ? (
        <path
          d={TRACE_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="0.16 0.84"
          style={{
            animation: `logo-trace-loader-loop ${loopDurationSeconds}s linear infinite`,
          }}
        />
      ) : null}
    </svg>
  );
}
