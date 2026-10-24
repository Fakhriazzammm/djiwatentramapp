import { describe, expect, it } from "bun:test";
import { requestAdminConfirm, requestAdminPrompt, subscribeAdminDialogs, type AdminDialogRequest } from "../admin-dialogs";

describe("admin dialogs", () => {
	it("confirm resolves with the host decision", async () => {
		let seen: AdminDialogRequest | null = null;
		const unsubscribe = subscribeAdminDialogs((request) => {
			seen = request;
			if (request.kind === "confirm") request.resolve(true);
		});

		const accepted = await requestAdminConfirm({ title: "Hapus?", message: "Yakin?" });
		unsubscribe();

		expect(accepted).toBe(true);
		expect(seen === null).toBe(false);
	});

	it("prompt resolves with the value the host provides, or null when cancelled", async () => {
		const unsubscribe = subscribeAdminDialogs((request) => {
			if (request.kind === "prompt") request.resolve(null);
		});
		const value = await requestAdminPrompt({ title: "Nama shift" });
		unsubscribe();
		expect(value).toBe(null);
	});

	it("unsubscribed listeners no longer receive requests and fall back to the native confirm", async () => {
		let calls = 0;
		const unsubscribe = subscribeAdminDialogs(() => {
			calls += 1;
		});
		unsubscribe();
		const globals = globalThis as { window?: unknown };
		const previous = globals.window;
		globals.window = { confirm: () => false };
		try {
			expect(await requestAdminConfirm({ title: "x", message: "y" })).toBe(false);
		} finally {
			globals.window = previous;
		}
		expect(calls).toBe(0);
	});
});
