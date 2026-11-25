import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { parseBrandOperations, registerKolBrandOperations } from "./kol-brand-operations";

describe("Brand campaign settings", () => {
  test("validates operational inputs without coercing invalid SLA values", () => {
    expect(parseBrandOperations({ reviewSlaHours: 48, internalNote: "  Shift pagi  " })).toEqual({
      reviewSlaHours: 48,
      internalNote: "Shift pagi",
    });
    for (const hours of [0, 721, 1.5, "48", NaN]) {
      expect(parseBrandOperations({ reviewSlaHours: hours, internalNote: "" })).toBeNull();
    }
    expect(parseBrandOperations({ reviewSlaHours: 48, internalNote: "a".repeat(1001) })).toBeNull();
  });

  test("supervisors can read the dashboard but cannot change settings", async () => {
    const app = new Hono();
    let writes = 0;
    registerKolBrandOperations(
      app,
      {
        api: {
          getSession: async ({ headers }: { headers: Headers }) =>
            headers.has("cookie") ? { user: { id: "supervisor-1" } } : null,
        },
      } as never,
      {
        query: async (sql: string) => {
          if (sql.includes("mgr_memberships")) return { rows: [{ status: "approved", role: "supervisor" }] };
          return { rows: [] };
        },
        connect: async () => {
          writes++;
          throw new Error("Mutation must be rejected before the database");
        },
      } as never,
    );
    const path = "/api/manager/kol-brand";
    expect((await app.request(`${path}/dashboard`)).status).toBe(401);
    const overview = await app.request(`${path}/dashboard`, { headers: { cookie: "session" } });
    expect(overview.status).toBe(200);
    expect((await overview.json()).data.canConfigure).toBe(false);
    const mutation = await app.request(`${path}/operations/1`, {
      method: "POST",
      headers: { cookie: "session", "Content-Type": "application/json" },
      body: JSON.stringify({ reviewSlaHours: 12, internalNote: "Internal" }),
    });
    expect(mutation.status).toBe(403);
    expect(writes).toBe(0);
  });
});
