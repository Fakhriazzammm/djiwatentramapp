import {
  filterWalletLedger,
  validateWalletSourceApp,
} from "./provenance.ts";

Deno.test("accepts only the canonical wallet source-app allow-list", () => {
  if (validateWalletSourceApp(" djiwa-travel ") !== "djiwa-travel") throw new Error("valid app was rejected");
  if (validateWalletSourceApp("b2b") !== "b2b") throw new Error("valid app was rejected");
  if (validateWalletSourceApp("djiwapay") !== "djiwapay") throw new Error("Djiwa Pay app was rejected");
  for (const value of ["https://djiwatravel.com", "customer", "", null]) {
    if (value === "") {
      if (validateWalletSourceApp(value) !== null) throw new Error("empty app was not treated as absent");
      continue;
    }
    if (value === null && validateWalletSourceApp(value) !== null) throw new Error("null app was not treated as absent");
    if (value !== null && value !== "" && (() => { try { validateWalletSourceApp(value); return false; } catch { return true; } })() !== true) {
      throw new Error(`untrusted app was accepted: ${value}`);
    }
  }
});

Deno.test("returns a server-selected filter and never infers one from origin", () => {
  const rows = [
    { id: 1, source_app: "djiwa-travel" },
    { id: 2, source_app: "b2b" },
    { id: 3, source_app: null },
  ];
  const filtered = filterWalletLedger(rows, validateWalletSourceApp("djiwa-travel"));
  if (filtered.length !== 1 || filtered[0].id !== 1) throw new Error("cross-app ledger row was not excluded");
  if (filterWalletLedger(rows, null).length !== 3) throw new Error("unscoped history changed");
});