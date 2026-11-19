import { describe, expect, test } from "bun:test";
import { unverifiableDomains } from "./smtp";

describe("unverifiableDomains", () => {
  test("believes Google only for a signature we could not evaluate, for the same domain", () => {
    expect(unverifiableDomains([{ signingDomain: "blubybcadigital.id", status: { result: "neutral", comment: "invalid public key" } }], ["blubybcadigital.id"])).toEqual(["blubybcadigital.id"]);
    expect(unverifiableDomains([{ signingDomain: "telkomsel.com", status: { result: "neutral", comment: "unknown key type" } }], ["telkomsel.com"])).toEqual(["telkomsel.com"]);
  });
  test("a signature that really failed, or a domain Google did not vouch for, stays refused", () => {
    expect(unverifiableDomains([{ signingDomain: "bca.co.id", status: { result: "fail", comment: "body hash did not verify" } }], ["bca.co.id"])).toEqual([]);
    expect(unverifiableDomains([{ signingDomain: "evil.com", status: { result: "neutral", comment: "invalid public key" } }], ["bca.co.id"])).toEqual([]);
    expect(unverifiableDomains([{ signingDomain: "bca.co.id", status: { result: "neutral", comment: "no key" } }], [])).toEqual([]);
  });
});
