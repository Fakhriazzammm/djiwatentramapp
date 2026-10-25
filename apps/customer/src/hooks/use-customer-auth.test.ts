import { fetchCustomer } from "./use-customer-auth";

declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (value: unknown) => {
  toBe(expected: unknown): void;
  rejects: { toThrow(expected: string): Promise<void> };
};

type FetchImplementation = typeof globalThis.fetch;

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

declare function afterEach(fn: () => void): void;

describe("fetchCustomer bootstrap", () => {
  test("aborts a hung profile request within the configured timeout", async () => {
    let aborted = false;
    globalThis.fetch = ((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
        reject(new Error("aborted"));
      });
    })) as FetchImplementation;

    await expect(fetchCustomer("user-1", null, 10)).rejects.toThrow("aborted");
    expect(aborted).toBe(true);
  });

  test("preserves rejected profile fetches for the auth fallback", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("network down"))) as FetchImplementation;

    await expect(fetchCustomer("user-1", null, 100)).rejects.toThrow("network down");
  });

  test("maps a successful profile response", async () => {
    globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({
      success: true,
      customer: { source_id: "user-1", email: "member@example.test", name: "Member" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }))) as FetchImplementation;

    const customer = await fetchCustomer("user-1", "member@example.test", 100);

    expect(customer?.sourceId).toBe("user-1");
    expect(customer?.email).toBe("member@example.test");
    expect(customer?.name).toBe("Member");
  });
});
