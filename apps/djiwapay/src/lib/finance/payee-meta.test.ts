import { describe, expect, test } from "bun:test";
import { mergeStores, metaOf } from "./payee-meta";

describe("payee meta stays the same on every device", () => {
  test("the newer answer per payee wins, whichever side it is on", () => {
    const local = { rani: { kind: "orang" as const, label: "Teman", at: 200 }, bayu: { label: "Kerja", at: 50 } };
    const server = [{ key: "rani", kind: "orang" as const, label: "Keluarga", at: 100 }, { key: "bayu", kind: null, label: "Teman", at: 90 }, { key: "dina", kind: "toko" as const, label: null, at: 10 }];
    const { next, push } = mergeStores(local, server);
    expect(next.rani).toEqual({ kind: "orang", label: "Teman", at: 200 });   // this phone is newer
    expect(next.bayu).toEqual({ label: "Teman", at: 90 });                   // the account is newer
    expect(next.dina).toEqual({ kind: "toko", at: 10 });                     // new from the account
    expect(push.map((p) => p.key)).toEqual(["rani"]);                        // only what the account has not heard
  });
  test("what exists only on this phone is sent, and an old phone copy without times never beats the account", () => {
    const { push } = mergeStores({ solo: { kind: "layanan", at: 5 } }, []);
    expect(push).toEqual([{ key: "solo", kind: "layanan", label: null, at: 5 }]);
    const { next } = mergeStores({ legacy: { label: "Lama", at: 1 } }, [{ key: "legacy", kind: null, label: "Baru", at: 1000 }]);
    expect(next.legacy.label).toBe("Baru");
  });
  test("a cleared answer is kept as a dated empty entry and reaches the other device", () => {
    const { next, push } = mergeStores({ rani: { at: 300 } }, [{ key: "rani", kind: "orang", label: "Teman", at: 100 }]);
    expect(metaOf(next)).toEqual({ kinds: {}, labels: {} });
    expect(push).toEqual([{ key: "rani", kind: null, label: null, at: 300 }]);
  });
});
