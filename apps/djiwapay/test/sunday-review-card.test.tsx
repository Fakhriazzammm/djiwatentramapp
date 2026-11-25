import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SundayReviewCard, sundayWindow } from "../src/features/finance/sunday-review-card";

test("Sunday card follows Jakarta midnight for exactly one day", () => {
  const start = Date.parse("2026-11-28T17:00:00Z");
  const end = start + 86400000;
  expect(sundayWindow(start - 1)).toEqual({ active: false, untilMidnight: 1 });
  expect(sundayWindow(start)).toEqual({ active: true, untilMidnight: 86400000 });
  expect(sundayWindow(end - 1)).toEqual({ active: true, untilMidnight: 1 });
  expect(sundayWindow(end).active).toBe(false);
  const original = Date.now;
  try {
    Date.now = () => start;
    expect(renderToStaticMarkup(createElement(SundayReviewCard, { onOpen() {} }))).toContain("mascot-sunday.png");
    Date.now = () => end;
    expect(renderToStaticMarkup(createElement(SundayReviewCard, { onOpen() {} }))).toBe("");
  } finally { Date.now = original; }
});
