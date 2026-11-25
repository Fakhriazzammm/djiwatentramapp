import { describe, expect, test } from "bun:test";
import { brandPost, parseBrandCampaign } from "./kol-brand-contract";
import { verifyBrandTopup } from "../../../supabase/functions/_shared/kol-brand-payment";

describe("Brand campaign contract", () => {
  test("gives distinct rewards to two deliverables on the same platform", () => {
    const campaign = parseBrandCampaign(
      {
        title: "Djiwa Weekend",
        brief: "Buat konten untuk kampanye ini.",
        terms: "Konten tetap publik.",
        quota: 2,
        applicationDeadline: "2026-12-05",
        deadline: "2026-12-15",
        tasks: [
          { label: "Thread", platform: "X", amount: 75000 },
          { label: "Single post", platform: "X", amount: 50000 },
        ],
      },
      "2026-11-25",
    );
    expect(campaign?.tasks.map((task) => task.amount)).toEqual([75000, 50000]);
  });

  test("normalizes a social post across user handles and tracking parameters", () => {
    expect(brandPost("https://twitter.com/a/status/12345?s=20", "X")?.key).toBe("x:12345");
    expect(brandPost("https://x.com/i/status/12345", "X")?.key).toBe("x:12345");
    expect(
      brandPost("https://www.linkedin.com/posts/test_activity-12345-abc?utm_source=share", "LinkedIn")?.key,
    ).toBe("linkedin:12345");
    expect(brandPost("https://x.com.example.org/i/status/12345", "X")).toBeNull();
    expect(brandPost("https://x.com/a", "X")).toBeNull();
    expect(brandPost("https://x.com/a/status/12345", "LinkedIn")).toBeNull();
  });
});

describe("Brand payment verification", () => {
  const invoice = { id: "inv-1", amount: 100700, status: "paid", transactionId: "tx-1" };
  const transaction = { id: "tx-1", amount: 100700, status: "paid", paymentLink: { id: "inv-1" } };
  const expected = { invoiceId: "inv-1", total: 100700 };
  test("settles from matching provider records", () => {
    expect(verifyBrandTopup(expected, invoice, transaction)).toEqual({
      status: "paid",
      transactionId: "tx-1",
    });
    expect(verifyBrandTopup(expected, { ...invoice, status: "open" }, transaction)).toEqual({
      status: "pending",
    });
  });
  test("holds mismatches for Finance", () => {
    for (const changed of [
      { ...transaction, amount: 100000 },
      { ...transaction, id: "tx-2" },
      { ...transaction, paymentLink: { id: "inv-2" } },
    ]) {
      expect(verifyBrandTopup(expected, invoice, changed).status).toBe("review");
    }
    expect(verifyBrandTopup(expected, invoice, { ...transaction, status: "unpaid" }).status).toBe("pending");
  });
});
