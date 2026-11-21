import { afterEach, describe, expect, test } from "bun:test";
import { isNativeApp, nativePlugin } from "../src/lib/native";

const g = globalThis as unknown as { window?: unknown };
afterEach(() => { delete g.window; });

describe("native app detection", () => {
  test("a normal browser (no Capacitor) is never native", () => {
    g.window = {};
    expect(isNativeApp()).toBe(false);
    expect(nativePlugin("App")).toBeUndefined();
  });
  test("inside the app the bridge exposes plugins", () => {
    const App = { exitApp: async () => undefined };
    g.window = { Capacitor: { isNativePlatform: () => true, Plugins: { App } } };
    expect(isNativeApp()).toBe(true);
    expect(nativePlugin("App")).toBe(App);
  });
  test("a throwing bridge counts as not native", () => {
    g.window = { Capacitor: { isNativePlatform: () => { throw new Error("x"); } } };
    expect(isNativeApp()).toBe(false);
  });
});
