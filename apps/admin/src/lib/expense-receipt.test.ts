import { describe, it, expect } from "bun:test";
import { expenseReceiptUrl } from "./expense-receipt";
describe("expense receipt source resolution", () => {
  it("supports ingestion metadata and manual attachments", () => {
    expect(
      expenseReceiptUrl({
        metadata: { receipt_image_url: "https://example.com/scan.png" },
      }),
    ).toBe("https://example.com/scan.png");
    expect(
      expenseReceiptUrl({ attachmentUrl: "https://example.com/manual.jpg" }),
    ).toBe("https://example.com/manual.jpg");
  });
  it("falls back to receipt documents and rejects unsafe references", () => {
    expect(
      expenseReceiptUrl(
        { metadata: { receipt_image_url: "javascript:alert(1)" } },
        "https://example.com/doc.png",
      ),
    ).toBe("https://example.com/doc.png");
    expect(expenseReceiptUrl({ attachmentUrl: "data:image/svg+xml,hi" })).toBe(
      null,
    );
    expect(expenseReceiptUrl({})).toBe(null);
  });
});
