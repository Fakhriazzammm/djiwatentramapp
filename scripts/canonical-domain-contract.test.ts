import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const activeFiles = [
  "apps/customer/index.html",
  "apps/customer/src/routes/masuk.lazy.tsx",
  "apps/customer/src/routes/index.lazy.tsx",
  "apps/customer/src/routes/$username/route.lazy.tsx",
  "apps/customer/src/components/customer/customer-home-discovery.tsx",
  "apps/booking/src/main.tsx",
  "apps/500kopitasik/index.html",
  "apps/auth-server/nginx-customer.conf",
  "apps/auth-server/better-auth.service",
  "apps/investor/deployment/investor-vhost.conf",
  "apps/investor/deployment/investor-auth-proxy.conf",
  "scripts/deploy-vps.sh",
  "scripts/deploy-admin.sh",
  "scripts/deploy-kolmarketing.sh",
  "scripts/sync-pos-notifications.sh",
  "scripts/low-stock-alert.py",
  "scripts/auto-close-shifts.sh",
  "scripts/deploy-functions-selfhost.sh",
  "scripts/backfill-inventory-prices.py",
  "supabase/functions/customer-auth/index.ts",
  "supabase/functions/kol-portal-admin/index.ts",
  "supabase/functions/onboarding-admin/index.ts",
  "supabase/functions/pos-notifications/index.ts",
  "supabase/functions/process-closing/index.ts",
  "supabase/functions/public-booking/payment-contract.ts",
  "supabase/functions/yumi-auth/index.ts",
  "supabase/functions/yumi-ai/index.ts",
] as const;

const legacyActiveDomain = /https?:\/\/(?:api|auth|supabase)\.yumme\.id|https?:\/\/(?:djiwatentram|booking|pay|investor|merchandise|b2b|ordermieyamin|500kopitasik|kolmarketing|rekrutmen|pos|karyawan|admindjiwatentram)\.yumme\.id|server_name\s+[^;]*\.yumme\.id/;

describe("canonical active domain contract", () => {
  test("active runtime and deployment files do not use legacy domains", () => {
    const offenders = activeFiles.flatMap((relativePath) => {
      const content = readFileSync(resolve(process.cwd(), relativePath), "utf8");
      return legacyActiveDomain.test(content) ? [relativePath] : [];
    });

    expect(offenders).toEqual([]);
  });

  test("canonical hosts remain explicit", () => {
    const customerAuth = readFileSync(resolve(process.cwd(), "apps/customer/src/lib/customer-auth-config.ts"), "utf8");
    const supabaseClient = readFileSync(resolve(process.cwd(), "packages/yumipos-web-shared/src/lib/client.ts"), "utf8");

    expect(customerAuth).toContain("https://api.djiwatentram.web.id");
    expect(supabaseClient).toContain("https://supabase.djiwatentram.web.id");
  });
});
