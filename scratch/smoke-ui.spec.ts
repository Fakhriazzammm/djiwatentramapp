import { test, expect } from "@playwright/test";

type RouteCheck = {
  name: string;
  path: string;
  actions: string[];
};

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3001";

const routes: RouteCheck[] = [
  { name: "Home", path: "/", actions: ["Menu", "Booking"] },
  { name: "Menu", path: "/menu", actions: ["Cart", "Checkout"] },
  { name: "Booking", path: "/booking", actions: ["Book", "Pilih"] },
  { name: "Attendance Index", path: "/attendance", actions: ["Masuk", "Lanjut"] },
  { name: "Admin Dashboard", path: "/admin", actions: ["Forecast", "Produk"] },
  { name: "Admin Products", path: "/admin/products", actions: ["Tambah", "Import CSV", "Saran AI"] },
  { name: "Admin Inventory", path: "/admin/inventory", actions: ["Tambah", "AI", "Workspace"] },
  { name: "Admin Discounts", path: "/admin/discounts", actions: ["Saran AI", "Tambah Diskon"] },
  { name: "Admin HPP", path: "/admin/hpp-calculator", actions: ["Draft", "Sinkron"] },
  { name: "Admin Minigames", path: "/admin/minigames", actions: ["Simpan", "Data Peserta"] },
  { name: "Admin Orders", path: "/admin/orders", actions: ["Filter", "Semua"] },
  { name: "Admin Kitchen", path: "/admin/kitchen", actions: ["Kitchen", "Bar"] },
  { name: "Admin Settings", path: "/admin/settings", actions: ["Simpan", "Pengaturan"] },
  { name: "Brand Minigames", path: "/djiwatentram/minigames", actions: ["SPIN", "Mini Games"] },
];

async function clickIfVisible(page: any, label: string) {
  const locator = page.getByRole("button", { name: new RegExp(label, "i") }).first();
  const visible = await locator.isVisible().catch(() => false);
  if (!visible) return { status: "skipped", reason: "button_not_found" as const };
  const disabled = await locator.isDisabled().catch(() => true);
  if (disabled) return { status: "skipped", reason: "button_disabled" as const };
  await locator.click({ timeout: 3000 });
  await page.waitForTimeout(350);
  await page.keyboard.press("Escape").catch(() => undefined);
  return { status: "passed" as const };
}

test("UI smoke routes and key actions", async ({ page }, testInfo) => {
  const routeReports: any[] = [];

  for (const route of routes) {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    const onPageError = (err: Error) => pageErrors.push(err.message);
    const onConsole = (msg: any) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    };

    page.on("pageerror", onPageError);
    page.on("console", onConsole);

    const url = `${BASE_URL}${route.path}`;
    let routeStatus: "passed" | "failed" = "passed";
    let routeReason = "ok";

    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
      await page.waitForTimeout(1200);
      const html = await page.content();
      if (!resp || !resp.ok()) {
        routeStatus = "failed";
        routeReason = `http_${resp?.status() ?? "n/a"}`;
      } else if (html.includes("Legacy fallback is disabled")) {
        routeStatus = "failed";
        routeReason = "legacy_fallback_error";
      } else if (html.includes("Application error") || html.includes("Something went wrong")) {
        routeStatus = "failed";
        routeReason = "runtime_error_banner";
      }
    } catch (error: any) {
      routeStatus = "failed";
      routeReason = `navigation_error:${error?.message ?? "unknown"}`;
    }

    const actionReports: any[] = [];
    if (routeStatus === "passed") {
      for (const action of route.actions) {
        try {
          const actionResult = await clickIfVisible(page, action);
          actionReports.push({ action, ...actionResult });
        } catch (error: any) {
          actionReports.push({ action, status: "failed", reason: error?.message ?? "click_failed" });
          routeStatus = "failed";
          routeReason = `action_failed:${action}`;
        }
      }
    }

    if (pageErrors.length > 0 || consoleErrors.some((msg) => msg.includes("Legacy fallback is disabled"))) {
      routeStatus = "failed";
      if (routeReason === "ok") routeReason = "console_or_page_error";
    }

    routeReports.push({
      name: route.name,
      path: route.path,
      status: routeStatus,
      reason: routeReason,
      pageErrors,
      consoleErrors,
      actions: actionReports,
    });

    page.off("pageerror", onPageError);
    page.off("console", onConsole);
  }

  await testInfo.attach("smoke-report.json", {
    body: Buffer.from(JSON.stringify(routeReports, null, 2), "utf-8"),
    contentType: "application/json",
  });

  const failed = routeReports.filter((r) => r.status === "failed");
  expect(failed, `Failed routes: ${JSON.stringify(failed, null, 2)}`).toEqual([]);
});
