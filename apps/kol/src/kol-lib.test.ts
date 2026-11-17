import { describe, expect, it } from "bun:test";
import { inAppBrowserName, loginErrorText } from "./kol-lib";

const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const SAFARI_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const INSTAGRAM_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.20.113 (iPhone14,5; iOS 18_7; en_US; en-US; scale=3.00; 1170x2532; 123456)";
const FACEBOOK_ANDROID = "Mozilla/5.0 (Linux; Android 13; SM-A536E Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/440.0.0.0.0;]";
const TIKTOK_ANDROID = "Mozilla/5.0 (Linux; Android 12; vivo Y21; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.0.0 Mobile Safari/537.36 trill_2023 musical_ly_29.1.0 BytedanceWebview/d8a21c6";
const GENERIC_WEBVIEW = "Mozilla/5.0 (Linux; Android 11; Redmi Note 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/110.0.0.0 Mobile Safari/537.36";

describe("login helpers", () => {
  it("does not flag normal browsers", () => {
    expect(inAppBrowserName(CHROME_ANDROID)).toBeNull();
    expect(inAppBrowserName(SAFARI_IOS)).toBeNull();
    expect(inAppBrowserName("")).toBeNull();
  });

  it("flags in-app browsers where Google blocks sign-in", () => {
    expect(inAppBrowserName(INSTAGRAM_IOS)).toBe("Instagram");
    expect(inAppBrowserName(FACEBOOK_ANDROID)).toBe("Facebook");
    expect(inAppBrowserName(TIKTOK_ANDROID)).toBe("TikTok");
    expect(inAppBrowserName(GENERIC_WEBVIEW)).toBe("aplikasi");
  });

  it("maps OAuth error codes to friendly Indonesian messages", () => {
    expect(loginErrorText("access_denied")).toContain("dibatalkan");
    expect(loginErrorText("state_mismatch")).toContain("satu kali");
    expect(loginErrorText("please_restart_the_process")).toContain("satu kali");
    expect(loginErrorText(null)).toContain("belum berhasil");
    expect(loginErrorText("something_else")).toContain("Chrome atau Safari");
  });
});
