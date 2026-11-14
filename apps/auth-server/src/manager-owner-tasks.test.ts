import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import type { Pool } from "pg";
import { registerManagerPortalRoutes } from "./manager-portal";

describe("Owner task inbox", () => {
  function setup(role = "owner") {
    const queries: string[] = [];
    const pool = {
      query: async (sql: string) => {
        queries.push(sql);
        return {
          rows: sql.includes("yumi_sessions")
            ? [{ source_id: "test-owner", name: "Owner", role_name: role }]
            : [
                {
                  id: "task-1",
                  title: "Review outlet",
                  status: "open",
                  assignee_role: "manager",
                  comment_count: 2,
                },
              ],
        };
      },
    } as unknown as Pool;
    const app = new Hono();
    registerManagerPortalRoutes(
      app,
      {} as Parameters<typeof registerManagerPortalRoutes>[1],
      pool,
    );
    return { app, queries };
  }
  it("rejects an anonymous request before reading task data", async () => {
    const { app, queries } = setup();
    const r = await app.request("/api/admin-manager/tasks");
    expect(r.status).toBe(401);
    expect(queries).toHaveLength(0);
  });
  it("rejects a staff session without an Admin role", async () => {
    const { app, queries } = setup("cashier");
    const r = await app.request("/api/admin-manager/tasks", {
      headers: { Authorization: "Bearer ys_test" },
    });
    expect(r.status).toBe(403);
    expect(queries).toHaveLength(1);
  });
  it("returns the shared task records for an Owner session", async () => {
    const { app, queries } = setup();
    const r = await app.request("/api/admin-manager/tasks", {
      headers: { Authorization: "Bearer ys_test" },
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect((await r.json()).tasks[0]).toMatchObject({
      id: "task-1",
      comment_count: 2,
    });
    expect(queries[1]).toContain("LIMIT 500");
  });
});
