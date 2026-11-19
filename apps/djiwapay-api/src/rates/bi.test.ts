import { describe, expect, test } from "bun:test";
import { parseBiRate, summarizeRates } from "./bi";
import { nextDelay } from "./service";

// Trimmed from Bank Indonesia's page on 19 Nov 2026: the hidden JSON (quotes HTML-escaped) and the first table rows.
const SERIES = [[1794960000000, 6, "6,00 %"], [1792540800000, 5.75, "5,75 %"], [1790121600000, 5.75, "5,75 %"], [1787097600000, 5.75, "5,75 %"], [1784678400000, 5.75, "5,75 %"], [1781740800000, 5.75, "5,75 %"], [1780963200000, 5.5, "5,50 %"], [1779235200000, 5.25, "5,25 %"], [1776816000000, 4.75, "4,75 %"], [1773705600000, 4.75, "4,75 %"], [1771459200000, 4.75, "4,75 %"], [1768953600000, 4.75, "4,75 %"], [1765929600000, 4.75, "4,75 %"], [1752624000000, 5.25, "5,25 %"], [1658361600000, 3.5000000000000004, "3,50 %"]];
const escaped = JSON.stringify(SERIES).replace(/"/g, "&quot;");
const PAGE = `<div><input id="HiddenFieldChartData" name="ctl00$x" type="hidden" value="${escaped}"/><input id="HiddenFieldLang" value="id"/></div>`;
const TABLE = `<table><tbody>${[["18 November 2026", "6,00 %"], ["21 Oktober 2026", "5,75 %"], ["23 September 2026", "5,75 %"], ["19 Agustus 2026", "5,75 %"]].map(([d, r]) => `<tr><td class="text-center">1</td><td class="text-center">${d}</td>\n<td class="text-center">${r}</td><td><a href="#">Lihat</a></td></tr>`).join("")}</tbody></table>`;

describe("BI-Rate page", () => {
  test("reads the JSON history, newest first, with floats tidied", () => {
    const pts = parseBiRate(PAGE);
    expect(pts[0]).toEqual({ day: "2026-11-18", rate: 6 }); expect(pts[1]).toEqual({ day: "2026-10-21", rate: 5.75 }); expect(pts).toHaveLength(15);
    expect(pts[pts.length - 1].rate).toBe(3.5); expect(pts.map((p) => p.day)).toEqual([...pts.map((p) => p.day)].sort().reverse());
  });
  test("attribute quotes and order do not matter", () => {
    const single = `<input type='hidden' value='${JSON.stringify(SERIES)}' id='x' /><input name="n" id="HiddenFieldChartData" value='${JSON.stringify(SERIES)}'>`;
    expect(parseBiRate(single)[0].rate).toBe(6);
  });
  test("falls back to the table when the JSON is missing or broken", () => {
    const pts = parseBiRate(`<input id="HiddenFieldChartData" value="[[oops"/>${TABLE}`);
    expect(pts).toEqual([{ day: "2026-11-18", rate: 6 }, { day: "2026-10-21", rate: 5.75 }, { day: "2026-09-23", rate: 5.75 }, { day: "2026-08-19", rate: 5.75 }]);
  });
  test("a page with nothing readable is an error, never a guess", () => { expect(() => parseBiRate("<html>maintenance</html>")).toThrow("BI_RATE_UNREADABLE"); });
  test("impossible values are dropped", () => {
    const bad = JSON.stringify([...SERIES, [1794960000000 + 86400000, 99, "99 %"], [1794960000000 + 2 * 86400000, 0, "0 %"]]);
    expect(parseBiRate(`<input id="HiddenFieldChartData" value='${bad}'>`)[0].rate).toBe(6);
  });
  test("summary: current, previous, and the last real change", () => {
    const s = summarizeRates(parseBiRate(PAGE))!;
    expect(s).toMatchObject({ rate: 6, day: "2026-11-18", previous: 5.75, lastChange: { day: "2026-11-18", from: 5.75, to: 6, bps: 25 } });
    const hold = summarizeRates([{ day: "2026-12-17", rate: 6 }, { day: "2026-11-18", rate: 6 }, { day: "2026-10-21", rate: 5.75 }])!;
    expect(hold.lastChange).toEqual({ day: "2026-11-18", from: 5.75, to: 6, bps: 25 });
    expect(summarizeRates([])).toBeNull();
  });
});

describe("when to look", () => {
  const at = (iso: string) => new Date(iso);
  test("every 10 minutes in the afternoon of a weekday in the Board's window, hourly otherwise", () => {
    expect(nextDelay(at("2026-11-18T07:30:00Z"))).toBe(10 * 60_000);       // Wed 18 Nov, 14:30 WIB
    expect(nextDelay(at("2026-11-18T02:00:00Z"))).toBe(3600_000);          // 09:00 WIB, before the announcement
    expect(nextDelay(at("2026-11-08T07:30:00Z"))).toBe(3600_000);          // day 8
    expect(nextDelay(at("2026-11-21T07:30:00Z"))).toBe(3600_000);          // Saturday
  });
  test("a failed look is retried in 15 minutes", () => { expect(nextDelay(at("2026-11-08T07:30:00Z"), false)).toBe(15 * 60_000); });
});
