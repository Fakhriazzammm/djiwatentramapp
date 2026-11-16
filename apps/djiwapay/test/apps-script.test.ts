import { describe, expect, test } from "bun:test";
import { hookStatusText } from "../src/features/integrations/apps-script";

describe("apps script card wording", () => {
  test("every outcome the server can report reads as plain Indonesian", () => {
    expect(hookStatusText("auto")).toBe("dicatat otomatis");
    expect(hookStatusText("review")).toBe("masuk antrean tinjau");
    expect(hookStatusText("duplicate")).toBe("sudah pernah masuk");
    expect(hookStatusText("ignored", "auth-failed")).toContain("tanda tangan");
    expect(hookStatusText("ignored", "sender-not-allowed")).toContain("bank atau e-wallet");
    expect(hookStatusText("ignored", "secret")).toContain("OTP");
    expect(hookStatusText(null)).toBe("");
  });
});
