import { describe, expect, test } from "bun:test";
import { fmtMoney, fmtReceiptTime, fromLocalInput, parseTrip, toLocalInput, toRupiah, tripTag } from "./currency";

describe("currency", () => {
  test("formats with the currency's symbol and decimals", () => {
    expect(fmtMoney(1200, "JPY")).toBe("¥1.200"); expect(fmtMoney(12.5, "USD")).toBe("$12,5"); expect(fmtMoney(28000, "IDR")).toBe("Rp 28.000"); expect(fmtMoney(-144, "JPY")).toBe("−¥144");
    expect(fmtMoney(3.456, "JPY")).toBe("¥3");
  });
  test("rupiah is rounded to whole rupiah", () => { expect(toRupiah(1200, 106.34)).toBe(127608); });
  test("receipt time is shown in the receipt's own zone", () => {
    expect(fmtReceiptTime("2025-11-25T04:14:00.000Z", "JPY")).toBe("25 Nov 2025 · 13.14");
    expect(toLocalInput("2025-11-25T04:14:00.000Z", "JPY")).toBe("2025-11-25T13:14");
    expect(fromLocalInput("2025-11-25T13:14", "JPY")).toBe("2025-11-25T04:14:00.000Z");
  });
  test("trip tags round trip", () => {
    const t = tripTag("JPY", "2025-11-25T04:14:00.000Z"); expect(t).toBe("trip:JPY-2025-11");
    expect(parseTrip(t)?.label).toBe("Jepang · Nov 2025"); expect(parseTrip("makan")).toBeNull();
  });
});
