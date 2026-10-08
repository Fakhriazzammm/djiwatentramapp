import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const canonical = "https://auth.zantara.id/api/auth";
const clients = {
  customer: "src/lib/customer-auth-flow.ts",
  merchandise: "src/lib/auth-client.ts",
  b2b: "src/lib/auth-client.ts",
  ordermieyamin: "src/lib/auth-client.ts",
  investor: "src/lib/auth-client.ts",
  kol: "src/App.tsx",
  "500kopitasik": "src/lib/api.ts",
  booking: "src/lib/customer-auth.ts",
  rekrutmen: "public/admin.html",
};

for (const [app, path] of Object.entries(clients)) {
  test(`${app} uses the canonical Better Auth route`, () => {
    const source = read(`apps/${app}/${path}`);
    assert.ok(source.includes(canonical));
    assert.doesNotMatch(source, /https:\/\/(?:api\.yumme\.id\/v1|djiwatentram\.yumme\.id\/api)\/auth/);
  });
}

test("customer auth and profile origins remain separate", () => {
  const source = read("apps/customer/src/lib/customer-auth-flow.ts");
  assert.ok(source.includes('CUSTOMER_PROFILE_BASE_URL = "https://djiwatentram.yumme.id/api/customer"'));
  assert.ok(read("apps/customer/src/lib/auth-client.ts").includes("baseURL: CUSTOMER_AUTH_BASE_URL"));
});

test("booking keeps browser login, auth session, and profile APIs separate", () => {
  const source = read("apps/booking/src/lib/customer-auth.ts");
  assert.ok(source.includes('LOGIN_URL = "https://djiwatentram.yumme.id/masuk"'));
  assert.ok(source.includes('CUSTOMER_API_BASE = "https://api.yumme.id/v1/customer"'));
  assert.ok(source.includes("fetch(`${AUTH_BASE}/get-session`"));
  assert.ok(source.includes("fetch(`${CUSTOMER_API_BASE}/profile`"));
  assert.ok(source.includes("new URL(LOGIN_URL)"));
  assert.doesNotMatch(source, /AUTH_BASE\}\/v1/);
});

test("recruitment moves both compatible auth routes", () => {
  const source = read("apps/rekrutmen/public/admin.html");
  for (const route of ["sign-in/social", "recruitment-session"]) {
    assert.ok(source.includes(`fetch('${canonical}/${route}'`));
  }
});

test("business APIs retain their existing origins", () => {
  for (const app of ["merchandise", "b2b", "ordermieyamin"]) {
    assert.ok(read(`apps/${app}/src/hooks/use-customer-auth.tsx`).includes('CUSTOMER_API_BASE = "https://api.yumme.id/v1/customer"'));
  }
  assert.ok(read("apps/kol/src/App.tsx").includes('KOL_API="https://api.yumme.id/v1/kol"'));
  assert.ok(read("apps/500kopitasik/src/lib/api.ts").includes('API_BASE = "https://api.yumme.id/v1/coffee-passport"'));
  assert.ok(read("apps/investor/src/routes/dashboard.tsx").includes('|| "https://api.yumme.id"'));
});
