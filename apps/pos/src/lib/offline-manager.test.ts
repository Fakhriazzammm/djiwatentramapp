import { describe, expect, it } from "bun:test";
import { strict as assert } from "node:assert";
import { OfflineManager } from "./offline-manager";

let records: Map<string, string>;
let failWrites = false;
const managers: OfflineManager[] = [];
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
function setup() {
  records = new Map();
  failWrites = false;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => { if (failWrites) throw new Error("quota"); records.set(key, value); },
    removeItem: (key: string) => records.delete(key),
  } });
}
function teardown() {
  for (const manager of managers.splice(0)) manager.cleanup();
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
}
function test(name: string, run: () => void | Promise<void>) {
  it(name, async () => {
    setup();
    try { await run(); } finally { teardown(); }
  });
}
function manager(maxRetries = 2) {
  const value = new OfflineManager({ maxRetries, retryInterval: 600_000 });
  managers.push(value);
  return value;
}

describe("durable offline queue", () => {
  test("retains exhausted failures across reload with safe error and attempt time", async () => {
    const queue = manager();
    queue.queueAction("createOrder", { total: 45000 });
    let calls = 0;
    queue.registerExecutor("createOrder", async () => { calls++; throw new Error("secret token and SQL"); });
    await queue.syncQueuedActions();
    await queue.syncQueuedActions();
    await queue.syncQueuedActions();
    expect(calls).toBe(2);
    const action = manager().getState().queuedActions[0]!;
    expect(action.status).toBe("failed");
    expect(action.retries).toBe(2);
    expect((action.lastAttemptAt ?? 0) > 0).toBe(true);
    expect(Boolean(action.lastError)).toBe(true);
    expect(action.lastError?.includes("secret")).toBe(false);
    expect(queue.getPendingSyncCount()).toBe(1);
    expect(manager().getPendingSyncCount()).toBe(1);
  });

  test("manual retry preserves identity and payload and removes only on success", async () => {
    const queue = manager(1);
    const id = queue.queueAction("createOrder", { requestKey: "stable-key" });
    queue.registerExecutor("createOrder", async () => { throw new Error("no"); });
    await queue.syncQueuedActions();
    let retried: unknown;
    queue.registerExecutor("createOrder", async (action) => { retried = { id: action.id, data: action.data }; });
    await queue.retryAction(id);
    expect(retried).toEqual({ id, data: { requestKey: "stable-key" } });
    expect(manager().getQueueSize()).toBe(0);
  });

  test("failed durable enqueue throws and retains existing records in memory and storage", () => {
    const queue = manager();
    const id = queue.queueAction("createOrder", { total: 10 });
    const saved = records.get("pos-offline");
    failWrites = true;
    assert.throws(() => queue.queueAction("createOrder", { total: 20 }));
    expect(queue.getState().queuedActions.map((action) => action.id)).toEqual([id]);
    expect(records.get("pos-offline")).toBe(saved);
  });

  test("loads legacy actions and stops already exhausted ones without executing", async () => {
    records.set("pos-offline", JSON.stringify({ queuedActions: [
      { id: "old", type: "createOrder", timestamp: 1, data: {}, retries: 3, maxRetries: 3 },
      { id: "pending", type: "createOrder", timestamp: 2, data: {}, retries: 0, maxRetries: 3 },
    ] }));
    const queue = manager();
    expect(queue.getPendingSyncCount()).toBe(2);
    const executed: string[] = [];
    queue.registerExecutor("createOrder", async (action) => { executed.push(action.id); });
    await queue.syncQueuedActions();
    expect(executed).toEqual(["pending"]);
    expect(queue.getState().queuedActions[0]?.status).toBe("failed");
  });

  test("concurrent sync and retry calls execute an action once and preserve new enqueues", async () => {
    const queue = manager();
    const id = queue.queueAction("createOrder", {});
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    queue.registerExecutor("createOrder", async () => { calls++; await blocked; });
    const first = queue.syncQueuedActions();
    const second = queue.syncQueuedActions();
    const retry = queue.retryAction(id);
    const added = queue.queueAction("other", { retained: true });
    release();
    await Promise.all([first, second, retry]);
    expect(calls).toBe(1);
    expect(queue.getState().queuedActions.map((action) => action.id)).toEqual([added]);
  });

  test("does not execute when attempt metadata cannot be persisted", async () => {
    const queue = manager();
    queue.queueAction("createOrder", {});
    let calls = 0;
    queue.registerExecutor("createOrder", async () => { calls++; });
    failWrites = true;
    await assert.rejects(queue.syncQueuedActions());
    expect(calls).toBe(0);
    expect(queue.getQueueSize()).toBe(1);
  });

  test("simultaneous manual retries share one retry budget", async () => {
    const queue = manager(1);
    const id = queue.queueAction("createOrder", {});
    let calls = 0;
    queue.registerExecutor("createOrder", async () => { calls++; throw new Error("failed"); });
    await queue.syncQueuedActions();
    await Promise.all([queue.retryAction(id), queue.retryAction(id), queue.retryAction(id)]);
    expect(calls).toBe(2);
    expect(queue.getState().queuedActions[0]?.status).toBe("failed");
  });

  test("offline manual retry persists pending state until connectivity returns", async () => {
    const queue = manager(1);
    const id = queue.queueAction("createOrder", {});
    queue.registerExecutor("createOrder", async () => { throw new Error("failed"); });
    await queue.syncQueuedActions();
    queue.setState({ isOnline: false });
    await queue.retryAction(id);
    expect(manager().getState().queuedActions[0]?.status).toBe("pending");
    expect(queue.getState().queuedActions[0]?.retries).toBe(0);
  });

  test("a successful remote send with failed local acknowledgement is not automatically repeated", async () => {
    const queue = manager();
    queue.queueAction("createOrder", {});
    let calls = 0;
    queue.registerExecutor("createOrder", async () => { calls++; failWrites = true; });
    await assert.rejects(queue.syncQueuedActions());
    failWrites = false;
    const restored = manager();
    restored.registerExecutor("createOrder", async () => { calls++; });
    await restored.syncQueuedActions();
    expect(calls).toBe(1);
    expect(restored.getState().queuedActions[0]?.status).toBe("failed");
  });

  test("persists intermediate retry metadata and does not consume retries without an executor", async () => {
    const queue = manager(3);
    queue.queueAction("createOrder", {});
    await queue.syncQueuedActions();
    expect(manager().getState().queuedActions[0]?.retries).toBe(0);
    queue.registerExecutor("createOrder", async () => { throw new Error("sensitive backend response"); });
    await queue.syncQueuedActions();
    const restored = manager().getState().queuedActions[0]!;
    expect(restored.retries).toBe(1);
    expect(restored.status).toBe("pending");
    expect((restored.lastAttemptAt ?? 0) > 0).toBe(true);
  });

  test("reports unreadable storage instead of claiming that the queue is empty", () => {
    records.set("pos-offline", "broken-json");
    expect(Boolean(manager().getState().storageError)).toBe(true);
  });

  test("unreadable saved data cannot be overwritten by enqueue", () => {
    records.set("pos-offline", "broken-json");
    const queue = manager();
    assert.throws(() => queue.queueAction("createOrder", {}));
    expect(records.get("pos-offline")).toBe("broken-json");
  });
});
