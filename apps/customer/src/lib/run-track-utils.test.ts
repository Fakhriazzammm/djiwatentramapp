import { formatClock, formatPace, liveDistanceKm, shouldKeepPoint } from "./run-track-utils";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: (value: unknown) => { toBe(expected: unknown): void; toBeCloseTo(expected: number, digits?: number): void };

const p = (lat: number, t: number, accuracy: number | null = 8) => ({ lat, lng: 106.8, accuracy, t });

describe("run track utils", () => {
  it("drops inaccurate and too-frequent points", () => {
    expect(shouldKeepPoint(undefined, p(-6.2, 0))).toBe(true);
    expect(shouldKeepPoint(p(-6.2, 0), p(-6.2001, 1000))).toBe(false);
    expect(shouldKeepPoint(p(-6.2, 0), p(-6.2001, 5000, 90))).toBe(false);
    expect(shouldKeepPoint(p(-6.2, 0), p(-6.2001, 5000))).toBe(true);
  });
  it("computes live distance and ignores gaps and impossible jumps", () => {
    const pts = [p(-6.2, 0), p(-6.2 + 15 / 111320, 5000), p(-6.2 + 30 / 111320, 10000)];
    expect(liveDistanceKm(pts)).toBeCloseTo(0.03, 2);
    expect(liveDistanceKm([p(-6.2, 0), p(-6.1, 5000)])).toBe(0);
    expect(liveDistanceKm([p(-6.2, 0), p(-6.19, 120000)])).toBe(0);
  });
  it("formats pace and clock", () => {
    expect(formatPace(372)).toBe("6:12");
    expect(formatPace(null)).toBe("–");
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(3725)).toBe("1:02:05");
  });
});
