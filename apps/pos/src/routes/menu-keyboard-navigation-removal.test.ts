import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "bun:test";

const menuSource = readFileSync(new URL("./menu.lazy.tsx", import.meta.url), "utf8");
const hookPath = new URL("../hooks/use-menu-keyboard-nav.ts", import.meta.url);

it("removes the dedicated POS keyboard-navigation feature and visible hints", () => {

 expect(existsSync(hookPath)).toBe(false);
 expect(menuSource).not.toContain("useMenuKeyboardNav");
 expect(menuSource).not.toContain("KEYBOARD SHORTCUT HINTS");
 expect(menuSource).not.toContain("F1: Header");
});

it("keeps ordinary product search and barcode controls", () => {
 expect(menuSource).toContain('placeholder="Cari produk..."');
 expect(menuSource).toContain('aria-label="Scan barcode untuk transaksi"');
});
