// Poll only while visible; resume immediately when the operator returns.
export function pollWhenVisible(
  reload: () => void,
  refreshMs: number,
  page: Pick<Document, "hidden" | "addEventListener" | "removeEventListener"> = document,
  timers: Pick<typeof globalThis, "setInterval" | "clearInterval"> = globalThis,
) {
  const poll = () => { if (!page.hidden) reload(); };
  const timer = timers.setInterval(poll, refreshMs);
  page.addEventListener("visibilitychange", poll);
  return () => {
    timers.clearInterval(timer);
    page.removeEventListener("visibilitychange", poll);
  };
}
