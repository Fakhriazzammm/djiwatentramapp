import { afterAll, describe, expect, it } from "bun:test";

const previousDeno = (globalThis as any).Deno;
const previousFetch = globalThis.fetch;
let serve: (request: Request) => Promise<Response>;
let orderUrl: URL | undefined;
let permissions = ["orders:view"];

(globalThis as any).Deno = {
  env: { get: (key: string) => key === "SUPABASE_URL" ? "https://example.test" : key === "SUPABASE_SERVICE_ROLE_KEY" ? "test-service-key" : undefined },
  serve: (handler: typeof serve) => { serve = handler; },
};
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = new URL(String(input));
  let body: unknown[];
  if (url.pathname.endsWith("/yumi_sessions")) body = [{ user_source_id: "test-user", expires_at: "2099-01-01T00:00:00Z" }];
  else if (url.pathname.endsWith("/yumi_users")) body = [{ source_id: "test-user", is_active: true, role_source_id: "test-role" }];
  else if (url.pathname.endsWith("/yumi_roles")) body = [{ name: "staff", permissions }];
  else if (url.pathname.endsWith("/pos_orders")) { orderUrl = url; body = [{ _id: "order-a" }]; }
  else throw new Error("Unexpected request: " + url.pathname);
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;
await import("./index.ts");

afterAll(() => { (globalThis as any).Deno = previousDeno; globalThis.fetch = previousFetch; });
describe("protected orders pagination", () => {
  it("keeps both period boundaries, stable ordering and the requested page", async () => {
    const response = await serve(new Request("https://edge.test", {
      method: "POST", headers: { "content-type": "application/json", "x-yumi-session-token": "test-token" },
      body: JSON.stringify({ action: "orders", query: { select: "_id,createdAt", gte: { createdAt: 1000 }, lt: { createdAt: 2000 }, order: [{ column: "createdAt", ascending: false }, { column: "_id", ascending: false }], range: [30, 60] } }),
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual([{ _id: "order-a" }]);
    expect(orderUrl?.searchParams.getAll("createdAt")).toEqual(["gte.1000", "lt.2000"]);
    expect(orderUrl?.searchParams.getAll("order")).toEqual(["createdAt.desc,_id.desc"]);
    expect(orderUrl?.searchParams.get("offset")).toBe("30");
    expect(orderUrl?.searchParams.get("limit")).toBe("31");
  });
  it("does not read orders without orders permission", async () => {
    permissions = [];
    orderUrl = undefined;
    const response = await serve(new Request("https://edge.test", {
      method: "POST", headers: { "content-type": "application/json", "x-yumi-session-token": "test-token" },
      body: JSON.stringify({ action: "orders", query: { range: [0, 30] } }),
    }));
    expect(response.status).toBe(403);
    expect(orderUrl).toBeUndefined();
    permissions = ["orders:view"];
  });
  it("rejects missing authentication", async () => {
    const response = await serve(new Request("https://edge.test", { method: "POST", body: JSON.stringify({ action: "orders" }) }));
    expect(response.status).toBe(401);
  });
});
