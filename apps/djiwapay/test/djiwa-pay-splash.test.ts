import { describe, expect, test } from "bun:test";
import {
  djiwaPaySplashLabel,
  isDjiwaPayPageReady,
  type DjiwaPayPageData,
} from "../src/lib/djiwa-pay-splash";

const readyPage: DjiwaPayPageData = {
  offline: false,
  walletLoading: false,
  walletPage: null,
  notificationsOpen: false,
  notificationsLoading: false,
  ppobSuccess: false,
  ppobPageActive: false,
  ppobCategory: "all",
  ppobCatalogReady: true,
  postpaidActive: false,
  postpaidCatalogReady: true,
  selectedPpobProduct: false,
};

const page = (overrides: Partial<DjiwaPayPageData>): DjiwaPayPageData => ({
  ...readyPage,
  ...overrides,
});

describe("Djiwa Pay splash labels", () => {
  test.each([
    ["/", "Kembali ke Djiwa Pay"],
    ["/wallet/topup", "Membuka Isi Saldo"],
    ["/wallet/transfer", "Membuka Kirim Saldo"],
    ["/wallet/transfer?mode=scan", "Membuka Pemindai QR"],
    ["/wallet/receive", "Membuka Terima Saldo"],
    ["/wallet/history", "Membuka Riwayat"],
    ["/wallet/history/123", "Membuka Detail Transaksi"],
    ["/wallet/help", "Membuka Bantuan"],
    ["/ppob", "Membuka Pembayaran PPOB"],
    ["/ppob/pulsa", "Membuka Pembayaran PPOB"],
    ["/ppob/pulsa/produk/TSEL5/detail", "Menyiapkan Pembayaran"],
    ["/ppob/pulsa/produk/TSEL5/konfirmasi", "Menyiapkan Pembayaran"],
    ["/ppob/pulsa/produk/TSEL5/struk", "Menyiapkan Struk"],
  ])("describes %s as %s", (path, expected) => {
    expect(djiwaPaySplashLabel(path)).toBe(expected);
  });

  test("keeps unknown destinations on the generic back label", () => {
    expect(djiwaPaySplashLabel("/wallet")).toBe("Kembali ke Djiwa Pay");
    expect(djiwaPaySplashLabel("")).toBe("Kembali ke Djiwa Pay");
  });
});

describe("Djiwa Pay page readiness", () => {
  test("waits for the wallet before revealing wallet pages", () => {
    expect(isDjiwaPayPageReady(page({ walletLoading: true }))).toBe(false);
    expect(isDjiwaPayPageReady(page({ walletLoading: false }))).toBe(true);
  });

  test("waits for wallet-backed pages such as history and transfer", () => {
    for (const walletPage of ["topup", "transfer", "receive", "history"] as const) {
      expect(isDjiwaPayPageReady(page({ walletPage, walletLoading: true }))).toBe(false);
      expect(isDjiwaPayPageReady(page({ walletPage, walletLoading: false }))).toBe(true);
    }
  });

  test("keeps the help page instant", () => {
    expect(isDjiwaPayPageReady(page({ walletPage: "help", walletLoading: true }))).toBe(true);
  });

  test("waits for the PPOB catalog instead of showing an empty grid", () => {
    const pulsa = {
      ppobPageActive: true,
      ppobCategory: "pulsa",
      ppobCatalogReady: false,
    };
    expect(isDjiwaPayPageReady(page({ ...pulsa, walletLoading: true }))).toBe(false);
    expect(isDjiwaPayPageReady(page({ ...pulsa, ppobCatalogReady: true, walletLoading: false }))).toBe(true);
  });

  test("treats a failed catalog as ready so the retry action is visible", () => {
    expect(isDjiwaPayPageReady(page({
      ppobPageActive: true,
      ppobCategory: "pulsa",
      ppobCatalogReady: true,
      walletLoading: false,
    }))).toBe(true);
  });

  test("shows the category picker without loading a catalog", () => {
    expect(isDjiwaPayPageReady(page({
      ppobPageActive: true,
      ppobCategory: "all",
      ppobCatalogReady: false,
    }))).toBe(true);
  });

  test("shows unavailable PPOB categories at once", () => {
    for (const ppobCategory of ["bpjs", "tv", "multifinance"]) {
      expect(isDjiwaPayPageReady(page({
        ppobPageActive: true,
        ppobCategory,
        ppobCatalogReady: false,
        walletLoading: true,
      }))).toBe(true);
    }
  });

  test("waits for the postpaid catalog, then releases on failure", () => {
    const bill = {
      ppobPageActive: true,
      ppobCategory: "pln-bill",
      postpaidActive: true,
      postpaidCatalogReady: false,
    };
    expect(isDjiwaPayPageReady(page({ ...bill, walletLoading: false }))).toBe(false);
    expect(isDjiwaPayPageReady(page({ ...bill, postpaidCatalogReady: true, walletLoading: false }))).toBe(true);
  });

  test("waits for a deep-linked product's catalog before showing details", () => {
    expect(isDjiwaPayPageReady(page({
      ppobPageActive: true,
      ppobCategory: "pulsa",
      ppobCatalogReady: false,
      selectedPpobProduct: false,
      walletLoading: false,
    }))).toBe(false);
    expect(isDjiwaPayPageReady(page({
      ppobPageActive: true,
      ppobCategory: "pulsa",
      ppobCatalogReady: true,
      selectedPpobProduct: true,
      walletLoading: false,
    }))).toBe(true);
  });

  test("waits for notifications when the panel opens", () => {
    expect(isDjiwaPayPageReady(page({ notificationsOpen: true, notificationsLoading: true }))).toBe(false);
    expect(isDjiwaPayPageReady(page({ notificationsOpen: true, notificationsLoading: false }))).toBe(true);
  });

  test("shows the receipt without waiting on the wallet", () => {
    expect(isDjiwaPayPageReady(page({ ppobSuccess: true, walletLoading: true }))).toBe(true);
  });

  test("never blocks an offline customer", () => {
    expect(isDjiwaPayPageReady(page({
      offline: true,
      ppobPageActive: true,
      ppobCategory: "pulsa",
      ppobCatalogReady: false,
      walletLoading: true,
    }))).toBe(true);
  });
});
