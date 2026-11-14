import { expect, test } from "bun:test";
import { pollWhenVisible } from "../../packages/djiwaapps-web-shared/src/lib/visible-polling";
test("hidden tabs skip periodic queries, resume on visibility, and stop on cleanup", () => {
  const page = Object.assign(new EventTarget(), { hidden: true });
  let tick: () => void = () => {}; let calls = 0; let cleared = false;
  const timers = { setInterval: (fn: () => void) => { tick = fn; return 1; }, clearInterval: () => { cleared = true; } };
  const stop = pollWhenVisible(() => calls++, 10000, page as any, timers as any);
  tick(); expect(calls).toBe(0);
  page.hidden = false; page.dispatchEvent(new Event("visibilitychange")); expect(calls).toBe(1);
  tick(); expect(calls).toBe(2);
  stop(); page.dispatchEvent(new Event("visibilitychange")); expect(calls).toBe(2); expect(cleared).toBe(true);
});
