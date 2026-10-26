import { describe, expect, test } from "bun:test";
import { buildGoogleSignInOptions } from "../src/lib/identity-adapter";

describe("Djiwa Pay Google auth", () => {
  test("uses one browser redirect and returns OAuth errors to Pay", () => {
    const callbackURL = "https://pay.djiwatentram.web.id/";

    expect(buildGoogleSignInOptions(callbackURL)).toEqual({
      provider: "google",
      callbackURL,
      errorCallbackURL: callbackURL,
      disableRedirect: true,
    });
  });
});
