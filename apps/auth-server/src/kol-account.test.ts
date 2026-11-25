import { expect, test } from "bun:test";
import { Hono } from "hono";
import { registerKolAccountRoutes } from "./kol-account";

function fixture() {
  const queries: { sql: string; params: unknown[] }[] = [];
  const app = new Hono();
  registerKolAccountRoutes(app, {
    api: { getSession: async ({ headers }: { headers: Headers }) => headers.has("cookie") ? { user: { id: "user-1" } } : null },
  } as never, {
    query: async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      return { rows: sql.startsWith("select user_type") ? [{ user_type: "customer" }] : [] };
    },
  } as never);
  return { app, queries };
}

test("checking roles after OAuth keeps the account unchanged", async () => {
  const { app, queries } = fixture();
  const response = await app.request("/api/kol/roles", { headers: { cookie: "session" } });
  expect(await response.json()).toEqual({ success: true, data: { userType: "customer", creator: null, brands: [] } });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(queries.every(({ sql, params }) => /^select/.test(sql) && params[0] === "user-1")).toBe(true);
});

test("choosing Brand needs a session and only updates the customer discriminator", async () => {
  const { app, queries } = fixture();
  const request = (role: string, signed = true) => app.request("/api/kol/roles", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(signed ? { cookie: "session" } : {}) },
    body: JSON.stringify({ role }),
  });
  expect((await request("brand", false)).status).toBe(401);
  expect((await request("admin")).status).toBe(400);
  expect((await request("brand")).status).toBe(200);
  expect(queries).toHaveLength(1);
  expect(queries[0]?.sql).toContain("and user_type = 'customer'");
  expect(queries[0]?.params).toEqual(["user-1"]);
});
