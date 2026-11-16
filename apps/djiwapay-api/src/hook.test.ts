import { describe, expect, test } from "bun:test";
import { hookQuery, hookScript, issuerDomains } from "./hook";

describe("apps script hook", () => {
  const url = "https://djiwapay.web.id/api/finance/hook/AbCdEfGhJkLmNpQrStUvWxYz23456789";
  test("the pasted script carries the user's URL and is valid JavaScript", () => {
    const s = hookScript(url);
    expect(s).toContain(`var DJIWA_URL = "${url}"`);
    expect(() => new Function(s)).not.toThrow();                         // parses
    for (const fn of ["pasang", "berhenti", "sinkron"]) expect(s).toContain(`function ${fn}(`);
  });
  test("it only ever reads and posts: no send, delete, trash or label calls", () => {
    const s = hookScript(url);
    for (const bad of ["sendEmail", "moveToTrash", "deleteLabel", "markRead", "reply(", "forward(", "addLabel", "GmailApp.send"]) expect(s).not.toContain(bad);
    expect(s).toContain("getRawContent");
  });
  test("sender list comes from the server's issuers", () => {
    expect(issuerDomains().length).toBeGreaterThan(5);
    expect(hookQuery()).toStartWith("from:(");
    expect(hookQuery()).toContain("gopay");
  });
});
