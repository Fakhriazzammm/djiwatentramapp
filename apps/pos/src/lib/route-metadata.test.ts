import { describe, expect, it } from "bun:test";
import { canAccessAdminRoute, HR_DESTINATIONS, isPublicRoute, safeReturnPath, loginPathFor } from "./route-metadata";

describe("POS route access", () => {
 it("allows HR managers without analytics and denies analytics-only HR access", () => {
  for (const destination of HR_DESTINATIONS) {
   expect(canAccessAdminRoute(destination.to, false, ["users:manage"])).toBe(true);
   expect(canAccessAdminRoute(destination.to, false, ["analytics:view"])).toBe(false);
  }
  expect(canAccessAdminRoute("/admin/operational-team/register/application/123", false, ["users:manage"])).toBe(true);
 });
 it("allows HPP for inventory OR finance and keeps recipe restricted", () => {
  for (const permission of ["inventory:manage", "finance:view"]) expect(canAccessAdminRoute("/admin/recipe/hpp", false, [permission])).toBe(true);
  expect(canAccessAdminRoute("/admin/recipe/base", false, ["finance:view"])).toBe(false);
  expect(canAccessAdminRoute("/admin/recipe/hpp", false, [])).toBe(false);
 });
 it("uses path boundaries and keeps the dashboard permission exact", () => {
  expect(canAccessAdminRoute("/admin", false, [])).toBe(false);
  expect(canAccessAdminRoute("/admin/kitchen", false, [])).toBe(true);
  expect(canAccessAdminRoute("/admin/operational-teamwork", false, ["users:manage"])).toBe(false);
  expect(canAccessAdminRoute("/admin/settings", true, [])).toBe(true);
 });
 it("requires authentication for reports, booking, attendance and employee profiles", () => {
  for (const path of ["/laporan", "/booking", "/attendance", "/karyawan/budi", "/register/selesai-evil/1"]) expect(isPublicRoute(path)).toBe(false);
  for (const path of ["/kasir/login", "/karyawan/login", "/admin/login", "/register", "/register/selesai/123"]) expect(isPublicRoute(path)).toBe(true);
 });
 it("preserves only safe local protected return paths", () => {
  expect(safeReturnPath("/laporan?date=2026-10-23#summary")).toBe("/laporan?date=2026-10-23#summary");
  for (const path of ["https://evil.test", "//evil.test", "/\\evil.test", "/kasir/login", "/register", "/%2f%2fevil.test", "/menu\n", "/x/../kasir/login", "/%2e%2e/kasir/login"]) expect(safeReturnPath(path)).toBe(null);
  expect(loginPathFor("/karyawan/budi")).toBe("/karyawan/login");
  expect(loginPathFor("/laporan")).toBe("/kasir/login");
 });
});
