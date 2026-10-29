import { describe, expect, test } from "bun:test";
import { resolvePayFrameContext } from "../src/lib/embed-context";

describe("Djiwa Pay frame context", () => {
  test("keeps its own bottom nav when opened standalone", () => {
    const context = resolvePayFrameContext({ framed: false, referrer: "https://djiwatravel.com/wallet/pay" });

    expect(context).toEqual({ framed: false, hostOrigin: null, host: null, hideBottomNav: false });
  });

  test("drops its bottom nav when Djiwa Travel frames it", () => {
    const context = resolvePayFrameContext({
      framed: true,
      referrer: "https://djiwatravel.com/",
      search: "?bridgeToken=abc",
    });

    expect(context.host).toBe("travel");
    expect(context.hostOrigin).toBe("https://djiwatravel.com");
    expect(context.hideBottomNav).toBe(true);
  });

  test("recognises the www travel host", () => {
    expect(resolvePayFrameContext({ framed: true, referrer: "https://www.djiwatravel.com/wallet/pay" }).host).toBe("travel");
  });

  test("still drops the nav when the host suppresses the referrer", () => {
    // referrerPolicy can hide the embedding page; the frame itself is the signal.
    const context = resolvePayFrameContext({ framed: true, referrer: "" });

    expect(context.hostOrigin).toBeNull();
    expect(context.host).toBe("unknown");
    expect(context.hideBottomNav).toBe(true);
  });

  test("treats an unrelated frame as a host without claiming a known app", () => {
    const context = resolvePayFrameContext({ framed: true, referrer: "https://example.com/embed" });

    expect(context.host).toBe("unknown");
    expect(context.hideBottomNav).toBe(true);
  });

  test("ignores a malformed or opaque referrer", () => {
    expect(resolvePayFrameContext({ framed: true, referrer: "not a url" }).hostOrigin).toBeNull();
    expect(resolvePayFrameContext({ framed: true, referrer: "about:blank" }).hostOrigin).toBeNull();
  });

  test("honours an explicit ?embed=0 opt-out", () => {
    const context = resolvePayFrameContext({
      framed: true,
      referrer: "https://djiwatravel.com/",
      search: "?embed=0",
    });

    expect(context.framed).toBe(true);
    expect(context.hideBottomNav).toBe(false);
  });
});
