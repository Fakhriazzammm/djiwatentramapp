import { describe, expect, test } from "bun:test";
import { tidyTitle } from "../src/lib/finance/review-format";

describe("tidyTitle", () => {
  test("drops the machine suffix and reads like a person wrote it", () => {
    expect(tidyTitle("TOKO LISTRIK BAROKAH · PAN 9360091800232207169")).toBe("Toko Listrik Barokah");
    expect(tidyTitle("SEBLAK TEH ENI · PAN 9360000801895027878")).toBe("Seblak Teh Eni");
    expect(tidyTitle("KOPILOGI TASIKMALAYA · PAN 9360000201107859467")).toBe("Kopilogi Tasikmalaya");
  });
  test("leaves ordinary titles alone and never returns an empty title", () => {
    expect(tidyTitle("Langganan Gojek PLUS")).toBe("Langganan Gojek PLUS");
    expect(tidyTitle("1234567890123")).toBe("1234567890123");
    expect(tidyTitle("PT. TOKOPEDIA")).toBe("Pt. Tokopedia");
  });
});
