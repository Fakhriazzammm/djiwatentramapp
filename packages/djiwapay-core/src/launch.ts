import { buildDjiwaPayUrl } from "./route-contract";
import type { DjiwaPayContext } from "./types";
export function launchDjiwaPay(input: { context: DjiwaPayContext; route?: "wallet" | "topup"; returnTo?: string; username?: string }): void {
  const browser = globalThis as typeof globalThis & { location?: { assign(url: string): void } };
  browser.location?.assign(buildDjiwaPayUrl(input));
}
