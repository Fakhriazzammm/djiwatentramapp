import { expect, test } from "bun:test";
import { weeklyAnalysisRoutes } from "./weekly-analysis";
import { createApp } from "./index";
import type { Tx } from "./sync";

const body = {
  income: 120000, previous: 150000, categories: [{ name: "Makan", amount: 10000 }],
  days: Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-${20 + i}`, spent: 10000, count: 1 })),
};
function post(payload: unknown) {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
}
test("weekly route requires the finance session", async () => {
  const app = createApp({ db: {} as Tx, resolve: async () => null, dir: "" });
  expect((await app.request("/api/finance/weekly-analysis", post(body))).status).toBe(401);
});
test("sends aggregate facts only and rate-limits repeat requests", async () => {
  const output = { insight: "Belanja minggu ini lebih rendah.", action: "Periksa kategori makan." };
  let facts;
  const route = weeklyAnalysisRoutes("test", (async (_url: string, options: RequestInit) => {
    facts = JSON.parse(JSON.parse(String(options?.body)).messages[1].content);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }));
  }) as unknown as typeof fetch);
  const res = await route.request("/", post({ ...body, note: "private" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(output);
  expect(facts).toMatchObject({ spent: 70000, net: 50000 });
  expect(facts).not.toHaveProperty("note");
  expect((await route.request("/", post(body))).status).toBe(429);
});
test("rejects incomplete periods and handles a malformed AI reply", async () => {
  const route = weeklyAnalysisRoutes("test", (async () => new Response('{"choices":[]}')) as unknown as typeof fetch);
  expect((await route.request("/", post({ ...body, days: [] }))).status).toBe(400);
  expect((await route.request("/", post(body))).status).toBe(503);
});
