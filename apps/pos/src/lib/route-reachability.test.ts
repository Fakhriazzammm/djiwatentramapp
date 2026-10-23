import { expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { canAccessAdminRoute, HR_DESTINATIONS } from "./route-metadata";
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

it("every mobile HR destination is registered in the generated route tree", () => {
 const tree = source("routeTree.gen.ts");
 for (const { to } of HR_DESTINATIONS) expect(tree.includes(`'${to}':`)).toBe(true);
});
it("employee data child renders through its parent Outlet", () => {
 expect(source("routes/admin/operational-team/karyawan.lazy.tsx")).toContain("<Outlet />");
});
it("mobile menu and direct guard share the route permission resolver", () => {
 const shell = source("routes/admin/route.tsx");
 expect(shell).toContain("HR_DESTINATIONS.map");
 expect(shell).toContain("canAccessAdminRoute(location.pathname");
 expect(shell).toContain("canAccessAdminRoute(item.to");
 expect(shell).toContain('aria-label="Cari menu"');
});
it("recovery destinations are valid routes and footer props reach shared footer", () => {
 for (const file of ["routes/karyawan.$username.lazy.tsx", "routes/register.lazy.tsx"]) expect(/["']\/login["']/.test(source(file))).toBe(false);
 expect(source("routes/admin/settings.lazy.tsx").includes("/register/approval")).toBe(false);
 expect(source("components/layout/Footer.tsx")).toContain("className={className} compact={compact}");
 expect(source("routes/__root.tsx")).toContain("notFoundComponent:");
});

it("all static admin navigation links resolve to registered routes and a known shell policy", () => {
 const shell = source("routes/admin/route.tsx");
 const tree = source("routeTree.gen.ts");
 const destinations = new Set([...shell.matchAll(/to[=:]\s*["'](\/admin[^"']*)["']/g)].map((match) => match[1]));
 const permissions = ["analytics:view", "orders:view", "products:manage", "inventory:manage", "finance:view", "users:manage", "settings:manage"];
 expect(destinations.size > 20).toBe(true);
 for (const to of destinations) {
  expect(tree.includes(`'${to}':`)).toBe(true);
  expect(canAccessAdminRoute(to, false, permissions)).toBe(true);
 }
});
