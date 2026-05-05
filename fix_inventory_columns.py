#!/usr/bin/env python3
"""
Restrukturisasi kolom tabel inventory Fase 1.
Makes all changes atomically to inventory.lazy.tsx
"""
import re

path = "/opt/djiwatentramapp/apps/web/src/routes/admin/inventory.lazy.tsx"

with open(path, "r") as f:
    content = f.read()

changes = []

# ═══════════════════════════════════════════════════════════════════════════
# 0. Add formatCurrencyIDR import
# ═══════════════════════════════════════════════════════════════════════════
if "formatCurrencyIDR" not in content:
    old = """\tuseHybridRealtimePriceMonitor,
} from "@/hooks/use-hybrid-inventory-admin-data";"""
    new = """\tuseHybridRealtimePriceMonitor,
} from "@/hooks/use-hybrid-inventory-admin-data";
import { formatCurrencyIDR } from "@/lib/export-utils";"""
    if old in content:
        content = content.replace(old, new, 1)
        changes.append("Added formatCurrencyIDR import")
    else:
        changes.append("FAILED: import location not found")

# ═══════════════════════════════════════════════════════════════════════════
# 1. Replace HEADER - remove Brand, Toko, Ukuran, Satuan Ukuran, Satuan Stok, Satuan Beli
#    Add Supplier, merge Satuan, rename Jml Beli, add Nilai Stok
# ═══════════════════════════════════════════════════════════════════════════
old_header = """\t\t\t\t\t\t\t<th className="px-2 py-1.5 font-semibold">
\t\t\t\t\t\t\t\tBrand
\t\t\t\t\t\t\t</th>
\t\t\t\t\t\t\t<th className="px-2 py-1.5 font-semibold">Toko</th>
\t\t\t\t\t\t\t<th className="px-2 py-1.5 text-center font-semibold">Ukuran</th>
\t\t\t\t\t\t\t<th className="px-2 py-1.5 text-center font-semibold">Satuan Ukuran</th>
\t\t\t\t\t\t\t<th
\t\t\t\t\t\t\t\tclassName="cursor-pointer px-2 py-1.5 text-center font-semibold transition-colors hover:text-foreground"
\t\t\t\t\t\t\t\tonClick={() => onSort("lowStockThreshold")}
\t\t\t\t\t\t\t>
\t\t\t\t\t\t\t\t<div className="flex items-center justify-center gap-1">
\t\t\t\t\t\t\t\t\tMin
\t\t\t\t\t\t\t\t\t{sortConfig.key === "lowStockThreshold" &&
\t\t\t\t\t\t\t\t\t\t(sortConfig.direction === "asc" ? (
\t\t\t\t\t\t\t\t\t\t\t<ArrowUp className="h-3 w-3" />
\t\t\t\t\t\t\t\t\t\t) : (
\t\t\t\t\t\t\t\t\t\t\t<ArrowDown className="h-3 w-3" />
\t\t\t\t\t\t\t\t\t\t))}
\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t</th>
\t\t\t\t\t\t\t<th
\t\t\t\t\t\t\t\tclassName="cursor-pointer px-2 py-1.5 text-center font-semibold transition-colors hover:text-foreground"
\t\t\t\t\t\t\t\tonClick={() => onSort("currentStock")}
\t\t\t\t\t\t\t>
\t\t\t\t\t\t\t\t<div className="flex items-center justify-center gap-1">
\t\t\t\t\t\t\t\t\tStock
\t\t\t\t\t\t\t\t\t{sortConfig.key === "currentStock" &&
\t\t\t\t\t\t\t\t\t\t(sortConfig.direction === "asc" ? (
\t\t\t\t\t\t\t\t\t\t\t<ArrowUp className="h-3 w-3" />
\t\t\t\t\t\t\t\t\t\t) : (
\t\t\t\t\t\t\t\t\t\t\t<ArrowDown className="h-3 w-3" />
\t\t\t\t\t\t\t\t\t\t))}
\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t</th>
\t\t\t\t\t\t\t<th className="px-2 py-1.5 text-center font-semibold">Satuan Stok</th>
\t\t\t\t\t\t\t<th className="px-2 py-1.5 text-center font-semibold">Jml Pembelian</th>
\t\t\t\t\t\t\t<th className="px-2 py-1.5 text-center font-semibold">Satuan Beli</th>
\t\t\t\t\t\t\t<th
\t\t\t\t\t\t\t\tclassName="cursor-pointer px-2 py-1.5 font-semibold transition-colors hover:text-foreground"
\t\t\t\t\t\t\t\tonClick={() => onSort("avgDailyUsage")}
\t\t\t\t\t\t\t>
\t\t\t\t\t\t\t\t<div className="flex items-center gap-1">
\t\t\t\t\t\t\t\t\tPemakaian
\t\t\t\t\t\t\t\t\t{sortConfig.key === "avgDailyUsage" &&
\t\t\t\t\t\t\t\t\t\t(sortConfig.direction === "asc" ? (
\t\t\t\t\t\t\t\t\t\t\t<ArrowUp className="h-3 w-3" />
\t\t\t\t\t\t\t\t\t\t) : (
\t\t\t\t\t\t\t\t\t\t\t<ArrowDown className="h-3 w-3" />
\t\t\t\t\t\t\t\t\t\t))}
\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t</th>
\t\t\t\t\t\t\t<th className="px-2 py-1.5 font-semibold">Harga Terakhir</th>
\t\t\t\t\t\t\t<th className="px-2 py-1.5 font-semibold">Sumber Restok</th>
\t\t\t\t\t\t\t<th className="px-2 py-1.5 font-semibold">Status</th>
\t\t\t\t\t\t\t<th className="px-2 py-1.5 text-right font-semibold">Aksi</th>"""

new_header = """\t\t\t\t\t\t\t<th className="px-2 py-1.5 font-semibold">Supplier</th>
\t\t\t\t\t\t\t<th
\t\t\t\t\t\t\t\tclassName="cursor-pointer px-2 py-1.5 text-center font-semibold transition-colors hover:text-foreground"
\t\t\t\t\t\t\t\tonClick={() => onSort("lowStockThreshold")}
\t\t\t\t\t\t\t>
\t\t\t\t\t\t\t\t<div className="flex items-center justify-center gap-1">
\t\t\t\t\t\t\t\t\tMin
\t\t\t\t\t\t\t\t\t{sortConfig.key === "lowStockThreshold" &&
\t\t\t\t\t\t\t\t\t\t(sortConfig.direction === "asc" ? (
\t\t\t\t\t\t\t\t\t\t\t<ArrowUp className="h-3 w-3" />
\t\t\t\t\t\t\t\t\t\t) : (
\t\t\t\t\t\t\t\t\t\t\t<ArrowDown className="h-3 w-3" />
\t\t\t\t\t\t\t\t\t\t))}
\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t</th>
\t\t\t\t\t\t\t<th
\t\t\t\t\t\t\t\tclassName="cursor-pointer px-2 py-1.5 text-center font-semibold transition-colors hover:text-foreground"
\t\t\t\t\t\t\t\tonClick={() => onSort("currentStock")}
\t\t\t\t\t\t\t>
\t\t\t\t\t\t\t\t<div className="flex items-center justify-center gap-1">
\t\t\t\t\t\t\t\t\tStock
\t\t\t\t\t\t\t\t\t{sortConfig.key === "currentStock" &&
\t\t\t\t\t\t\t\t\t\t(sortConfig.direction === "asc" ? (
\t\t\t\t\t\t\t\t\t\t\t<ArrowUp className="h-3 w-3" />
\t\t\t\t\t\t\t\t\t\t) : (
\t\t\t\t\t\t\t\t\t\t\t<ArrowDown className="h-3 w-3" />
\t\t\t\t\t\t\t\t\t\t))}
\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t</th>
\t\t\t\t\t\t\t<th className="px-2 py-1.5 text-center font-semibold group relative cursor-help">Satuan<span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap rounded bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-md">Stok: satuan stok · Beli: satuan beli</span></th>
\t\t\t\t\t\t\t<th className="px-2 py-1.5 text-center font-semibold">Jml Beli</th>
\t\t\t\t\t\t\t<th
\t\t\t\t\t\t\t\tclassName="cursor-pointer px-2 py-1.5 font-semibold transition-colors hover:text-foreground"
\t\t\t\t\t\t\t\tonClick={() => onSort("avgDailyUsage")}
\t\t\t\t\t\t\t>
\t\t\t\t\t\t\t\t<div className="flex items-center gap-1">
\t\t\t\t\t\t\t\t\tPemakaian
\t\t\t\t\t\t\t\t\t{sortConfig.key === "avgDailyUsage" &&
\t\t\t\t\t\t\t\t\t\t(sortConfig.direction === "asc" ? (
\t\t\t\t\t\t\t\t\t\t\t<ArrowUp className="h-3 w-3" />
\t\t\t\t\t\t\t\t\t\t) : (
\t\t\t\t\t\t\t\t\t\t\t<ArrowDown className="h-3 w-3" />
\t\t\t\t\t\t\t\t\t\t))}
\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t</th>
\t\t\t\t\t\t\t<th className="px-2 py-1.5 font-semibold">Harga Terakhir</th>
\t\t\t\t\t\t\t<th className="px-2 py-1.5 text-right font-semibold">Nilai Stok</th>
\t\t\t\t\t\t\t<th className="px-2 py-1.5 font-semibold">Sumber Restok</th>
\t\t\t\t\t\t\t<th className="px-2 py-1.5 font-semibold">Status</th>
\t\t\t\t\t\t\t<th className="px-2 py-1.5 text-right font-semibold">Aksi</th>"""

if old_header in content:
    content = content.replace(old_header, new_header, 1)
    changes.append("Replaced HEADER section")
else:
    changes.append("FAILED: HEADER section not found")
    # Debug
    idx = content.find('className="px-2 py-1.5 font-semibold">Brand</th>')
    print(f"  DEBUG: Brand th at {idx}")
    if idx >= 0:
        print(f"  Context: ...{content[idx:idx+200]}...")

# ═══════════════════════════════════════════════════════════════════════════
# 2. Replace QUICK-ADD row - remove brand, toko, ukuran, satuan ukuran
#    Add supplier td after ingredient name td
# ═══════════════════════════════════════════════════════════════════════════
old_qa = """\t\t\t\t\t\t\t<td className="px-2 py-1.5">
\t\t\t\t\t\t\t\t<input
\t\t\t\t\t\t\t\t\tclassName={`w-full rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-semibold outline-none focus:border-primary ${getSuggestionHighlightClass(
\t\t\t\t\t\t\t\t\t\tquickAdd.defaultBrandName.trim() !== "" &&
\t\t\t\t\t\t\t\t\t\t\tbrandOptionSet.has(normalizeLookupText(quickAdd.defaultBrandName))
\t\t\t\t\t\t\t\t\t)}`}
\t\t\t\t\t\t\t\t\tlist="inventory-brand-suggestions-table"
\t\t\t\t\t\t\t\t\tonChange={(e) =>
\t\t\t\t\t\t\t\t\t\tsetQuickAdd((prev) => ({
\t\t\t\t\t\t\t\t\t\t\t...prev,
\t\t\t\t\t\t\t\t\t\t\tdefaultBrandName: e.target.value,
\t\t\t\t\t\t\t\t\t\t}))
\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\tonKeyDown={(e) => {
\t\t\t\t\t\t\t\t\t\tif (e.key === "Enter") {
\t\t\t\t\t\t\t\t\t\t\tvoid quickCreate();
\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t}}
\t\t\t\t\t\t\t\t\tplaceholder="Brand opsional"
\t\t\t\t\t\t\t\t\tvalue={quickAdd.defaultBrandName}
\t\t\t\t\t\t\t\t/>
\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t<td className="px-2 py-1.5">
\t\t\t\t\t\t\t\t<input
\t\t\t\t\t\t\t\t\tclassName={`w-full rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-semibold outline-none focus:border-primary ${getSuggestionHighlightClass(
\t\t\t\t\t\t\t\t\t\tquickAdd.preferredStoreName.trim() !== "" &&
\t\t\t\t\t\t\t\t\t\t\tstoreOptionSet.has(normalizeLookupText(quickAdd.preferredStoreName))
\t\t\t\t\t\t\t\t\t)}`}
\t\t\t\t\t\t\t\t\tlist="inventory-store-suggestions-table"
\t\t\t\t\t\t\t\t\tonChange={(e) =>
\t\t\t\t\t\t\t\t\t\tsetQuickAdd((prev) => ({
\t\t\t\t\t\t\t\t\t\t\t...prev,
\t\t\t\t\t\t\t\t\t\t\tpreferredStoreName: e.target.value,
\t\t\t\t\t\t\t\t\t\t}))
\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\tonKeyDown={(e) => {
\t\t\t\t\t\t\t\t\t\tif (e.key === "Enter") {
\t\t\t\t\t\t\t\t\t\t\tvoid quickCreate();
\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t}}
\t\t\t\t\t\t\t\t\tplaceholder="Pilih / ketik toko"
\t\t\t\t\t\t\t\t\tvalue={quickAdd.preferredStoreName}
\t\t\t\t\t\t\t\t/>
\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t<td className="px-2 py-1.5 text-center">
\t\t\t\t\t\t\t\t<input
\t\t\t\t\t\t\t\t\tclassName="mx-auto w-16 rounded-lg border border-border bg-background px-1.5 py-0.5 text-center text-[10px] font-semibold outline-none focus:border-primary"
\t\t\t\t\t\t\t\t\tonChange={(e) =>
\t\t\t\t\t\t\t\t\t\tsetQuickAdd((prev) => ({
\t\t\t\t\t\t\t\t\t\t\t...prev,
\t\t\t\t\t\t\t\t\t\t\tconversionFactor: e.target.value,
\t\t\t\t\t\t\t\t\t\t}))
\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\tonKeyDown={(e) => {
\t\t\t\t\t\t\t\t\t\tif (e.key === "Enter") {
\t\t\t\t\t\t\t\t\t\t\tvoid quickCreate();
\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t}}
\t\t\t\t\t\t\t\t\tplaceholder="1000"
\t\t\t\t\t\t\t\t\ttype="number"
\t\t\t\t\t\t\t\t\tvalue={quickAdd.conversionFactor}
\t\t\t\t\t\t\t\t/>
\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t<td className="px-2 py-1.5 text-center">
\t\t\t\t\t\t\t\t<input
\t\t\t\t\t\t\t\t\tclassName={`mx-auto w-20 rounded-lg border border-border bg-background px-1.5 py-0.5 text-center text-[10px] font-semibold outline-none focus:border-primary ${getSuggestionHighlightClass(
\t\t\t\t\t\t\t\t\t\tquickAdd.displayUnit.trim() !== "" &&
\t\t\t\t\t\t\t\t\t\t\tunitOptionSet.has(normalizeUnitOption(quickAdd.displayUnit))
\t\t\t\t\t\t\t\t\t)}`}
\t\t\t\t\t\t\t\t\tlist="inventory-unit-options-table"
\t\t\t\t\t\t\t\t\tonChange={(e) =>
\t\t\t\t\t\t\t\t\t\tsetQuickAdd((prev) => ({
\t\t\t\t\t\t\t\t\t\t\t...prev,
\t\t\t\t\t\t\t\t\t\t\tdisplayUnit: normalizeUnitOption(e.target.value),
\t\t\t\t\t\t\t\t\t\t}))
\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\tonKeyDown={(e) => {
\t\t\t\t\t\t\t\t\t\tif (e.key === "Enter") {
\t\t\t\t\t\t\t\t\t\t\tvoid quickCreate();
\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t}}
\t\t\t\t\t\t\t\t\tplaceholder="gram / ml"
\t\t\t\t\t\t\t\t\tvalue={quickAdd.displayUnit}
\t\t\t\t\t\t\t\t/>
\t\t\t\t\t\t\t</td>"""

new_qa = """\t\t\t\t\t\t\t<td className="px-2 py-1.5">
\t\t\t\t\t\t\t\t<input
\t\t\t\t\t\t\t\t\tclassName="w-full rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-semibold outline-none focus:border-primary"
\t\t\t\t\t\t\t\t\tonChange={(e) =>
\t\t\t\t\t\t\t\t\t\tsetQuickAdd((prev) => ({
\t\t\t\t\t\t\t\t\t\t\t...prev,
\t\t\t\t\t\t\t\t\t\t\tsupplier: e.target.value,
\t\t\t\t\t\t\t\t\t\t}))
\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\tonKeyDown={(e) => {
\t\t\t\t\t\t\t\t\t\tif (e.key === "Enter") {
\t\t\t\t\t\t\t\t\t\t\tvoid quickCreate();
\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t}}
\t\t\t\t\t\t\t\t\tplaceholder="Toko - Brand"
\t\t\t\t\t\t\t\t\tvalue={quickAdd.supplier || ""}
\t\t\t\t\t\t\t\t/>
\t\t\t\t\t\t\t</td>"""

if old_qa in content:
    content = content.replace(old_qa, new_qa, 1)
    changes.append("Replaced QUICK-ADD brand+toko+ukuran+satuan ukuran with Supplier")
else:
    changes.append("FAILED: QUICK-ADD brand section not found")
    idx = content.find('placeholder="Brand opsional"')
    if idx >= 0:
        print(f"  DEBUG: 'Brand opsional' at {idx}")

# ═══════════════════════════════════════════════════════════════════════════
# 3. Replace QUICK-ADD - remove Satuan Beli placeholder (merge satuan stok + jml pembelian)
# The old quick-add has: unit input (satuan stok), then "-" (jml pembelian), then "-" (satuan beli)
# New: unit input (satuan), then "-" (jml beli) — remove the second "-"
# ═══════════════════════════════════════════════════════════════════════════
old_qa_units = """\t\t\t\t\t\t\t<td className="px-2 py-1.5 text-center">
\t\t\t\t\t\t\t\t<input
\t\t\t\t\t\t\t\t\tclassName={`mx-auto w-16 rounded-lg border border-border bg-background px-1.5 py-0.5 text-center text-[10px] font-semibold outline-none focus:border-primary ${getSuggestionHighlightClass(
\t\t\t\t\t\t\t\t\t\tquickAdd.unit.trim() !== "" &&
\t\t\t\t\t\t\t\t\t\t\tunitOptionSet.has(normalizeUnitOption(quickAdd.unit))
\t\t\t\t\t\t\t\t\t)}`}
\t\t\t\t\t\t\t\t\tlist="inventory-unit-options-table"
\t\t\t\t\t\t\t\t\tonChange={(e) =>
\t\t\t\t\t\t\t\t\t\tsetQuickAdd((prev) => ({
\t\t\t\t\t\t\t\t\t\t\t...prev,
\t\t\t\t\t\t\t\t\t\t\tunit: normalizeUnitOption(e.target.value),
\t\t\t\t\t\t\t\t\t\t}))
\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\tplaceholder="satuan"
\t\t\t\t\t\t\t\t\tvalue={quickAdd.unit}
\t\t\t\t\t\t\t\t/>
\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t<td className="px-2 py-1.5 text-center"><div className="text-[10px] text-muted-foreground">-</div></td>
\t\t\t\t\t\t\t<td className="px-2 py-1.5 text-center"><div className="text-[10px] text-muted-foreground">-</div></td>"""

new_qa_units = """\t\t\t\t\t\t\t<td className="px-2 py-1.5 text-center">
\t\t\t\t\t\t\t\t<input
\t\t\t\t\t\t\t\t\tclassName={`mx-auto w-16 rounded-lg border border-border bg-background px-1.5 py-0.5 text-center text-[10px] font-semibold outline-none focus:border-primary ${getSuggestionHighlightClass(
\t\t\t\t\t\t\t\t\t\tquickAdd.unit.trim() !== "" &&
\t\t\t\t\t\t\t\t\t\t\tunitOptionSet.has(normalizeUnitOption(quickAdd.unit))
\t\t\t\t\t\t\t\t\t)}`}
\t\t\t\t\t\t\t\t\tlist="inventory-unit-options-table"
\t\t\t\t\t\t\t\t\tonChange={(e) =>
\t\t\t\t\t\t\t\t\t\tsetQuickAdd((prev) => ({
\t\t\t\t\t\t\t\t\t\t\t...prev,
\t\t\t\t\t\t\t\t\t\t\tunit: normalizeUnitOption(e.target.value),
\t\t\t\t\t\t\t\t\t\t}))
\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\tplaceholder="satuan"
\t\t\t\t\t\t\t\t\tvalue={quickAdd.unit}
\t\t\t\t\t\t\t\t/>
\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t<td className="px-2 py-1.5 text-center"><div className="text-[10px] text-muted-foreground">-</div></td>"""

if old_qa_units in content:
    content = content.replace(old_qa_units, new_qa_units, 1)
    changes.append("Replaced QUICK-ADD satuan+jml pembelian+satuan beli -> satuan+jml beli")
else:
    changes.append("FAILED: QUICK-ADD unit section not found")
    idx = content.find('placeholder="satuan"')
    if idx >= 0:
        print(f"  DEBUG: 'satuan' placeholder at {idx}")

# ═══════════════════════════════════════════════════════════════════════════
# 4. Replace DATA ROW - Brand+Toko+Ukuran+Satuan Ukuran -> Supplier (read-only)
# ═══════════════════════════════════════════════════════════════════════════
old_dr = """\t\t\t\t\t\t\t\t\t\t<td className="px-2 py-1.5 align-middle">
\t\t\t\t\t\t\t\t\t\t\t<input
\t\t\t\t\t\t\t\t\t\t\t\tclassName={`w-full truncate rounded-lg border border-transparent bg-transparent px-1.5 py-1 font-semibold text-[10px] outline-none focus:border-border focus:bg-background ${getSuggestionHighlightClass(
\t\t\t\t\t\t\t\t\t\t\t\t\tinline.defaultBrandName.trim() !== "" &&
\t\t\t\t\t\t\t\t\t\t\t\t\t\tbrandOptionSet.has(normalizeLookupText(inline.defaultBrandName))
\t\t\t\t\t\t\t\t\t\t\t\t)}`}
\t\t\t\t\t\t\t\t\t\t\t\tlist="inventory-brand-suggestions-table"
\t\t\t\t\t\t\t\t\t\t\t\tonBlur={() => void saveMeta(row)}
\t\t\t\t\t\t\t\t\t\t\t\tonChange={(e) =>
\t\t\t\t\t\t\t\t\t\t\t\t\tsetInlineField(row, "defaultBrandName", e.target.value)
\t\t\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\t\t\tonKeyDown={(e) => {
\t\t\t\t\t\t\t\t\t\t\t\t\tif (e.key === "Enter") {
\t\t\t\t\t\t\t\t\t\t\t\t\t\tvoid saveMeta(row);
\t\t\t\t\t\t\t\t\t\t\t\t\t\t(e.target as HTMLInputElement).blur();
\t\t\t\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\t\t\t}}
\t\t\t\t\t\t\t\t\t\t\t\tplaceholder="-"
\t\t\t\t\t\t\t\t\t\t\t\tvalue={inline.defaultBrandName}
\t\t\t\t\t\t\t\t\t\t\t/>
\t\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t\t<td className="px-2 py-1.5 align-middle">
\t\t\t\t\t\t\t\t\t\t\t<input
\t\t\t\t\t\t\t\t\t\t\t\tclassName={`w-full truncate rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 text-[10px] font-semibold text-foreground outline-none focus:border-border focus:bg-background ${getSuggestionHighlightClass(
\t\t\t\t\t\t\t\t\t\t\t\t\tinline.preferredStoreName.trim() !== "" &&
\t\t\t\t\t\t\t\t\t\t\t\t\t\tstoreOptionSet.has(normalizeLookupText(inline.preferredStoreName))
\t\t\t\t\t\t\t\t\t\t\t\t)}`}
\t\t\t\t\t\t\t\t\t\t\t\tlist="inventory-store-suggestions-table"
\t\t\t\t\t\t\t\t\t\t\t\tonBlur={() => void saveMeta(row)}
\t\t\t\t\t\t\t\t\t\t\t\tonChange={(e) =>
\t\t\t\t\t\t\t\t\t\t\t\t\tsetInlineField(row, "preferredStoreName", e.target.value)
\t\t\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\t\t\tonKeyDown={(e) => {
\t\t\t\t\t\t\t\t\t\t\t\t\tif (e.key === "Enter") {
\t\t\t\t\t\t\t\t\t\t\t\t\t\tvoid saveMeta(row);
\t\t\t\t\t\t\t\t\t\t\t\t\t\t(e.target as HTMLInputElement).blur();
\t\t\t\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\t\t\t}}
\t\t\t\t\t\t\t\t\t\t\t\tplaceholder={row.lastPurchaseStoreName || row.preferredStoreName || "Toko"}
\t\t\t\t\t\t\t\t\t\t\t\tvalue={inline.preferredStoreName}
\t\t\t\t\t\t\t\t\t\t\t/>
\t\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t\t<td className="px-2 py-1.5 align-middle text-center">
\t\t\t\t\t\t\t\t\t\t\t<input
\t\t\t\t\t\t\t\t\t\t\t\tclassName="mx-auto w-16 rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 text-center text-[10px] font-semibold outline-none focus:border-border focus:bg-background"
\t\t\t\t\t\t\t\t\t\t\t\tmin={0}
\t\t\t\t\t\t\t\t\t\t\t\tonBlur={() => void saveMeta(row)}
\t\t\t\t\t\t\t\t\t\t\t\tonChange={(e) =>
\t\t\t\t\t\t\t\t\t\t\t\t\tsetInlineField(row, "conversionFactor", e.target.value)
\t\t\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\t\t\tonKeyDown={(e) => {
\t\t\t\t\t\t\t\t\t\t\t\t\tif (e.key === "Enter") {
\t\t\t\t\t\t\t\t\t\t\t\t\t\tvoid saveMeta(row);
\t\t\t\t\t\t\t\t\t\t\t\t\t\t(e.target as HTMLInputElement).blur();
\t\t\t\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\t\t\t}}
\t\t\t\t\t\t\t\t\t\t\t\tplaceholder={
\t\t\t\t\t\t\t\t\t\t\t\t\ttypeof row.unitConversions?.[0]?.factor === "number"
\t\t\t\t\t\t\t\t\t\t\t\t\t\t? String(row.unitConversions?.[0]?.factor)
\t\t\t\t\t\t\t\t\t\t\t\t\t\t: "-"
\t\t\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\t\t\ttype="number"
\t\t\t\t\t\t\t\t\t\t\t\tvalue={inline.conversionFactor}
\t\t\t\t\t\t\t\t\t\t\t/>
\t\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t\t<td className="px-2 py-1.5 align-middle text-center">
\t\t\t\t\t\t\t\t\t\t\t<input
\t\t\t\t\t\t\t\t\t\t\t\tclassName={`mx-auto w-20 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-center font-semibold text-[10px] text-muted-foreground outline-none focus:border-border focus:bg-background ${getSuggestionHighlightClass(
\t\t\t\t\t\t\t\t\t\t\t\t\tinline.displayUnit.trim() !== "" &&
\t\t\t\t\t\t\t\t\t\t\t\t\t\tunitOptionSet.has(normalizeUnitOption(inline.displayUnit))
\t\t\t\t\t\t\t\t\t\t\t\t)}`}
\t\t\t\t\t\t\t\t\t\t\t\tlist="inventory-unit-options-table"
\t\t\t\t\t\t\t\t\t\t\t\tonBlur={() => void saveMeta(row)}
\t\t\t\t\t\t\t\t\t\t\t\tonChange={(e) =>
\t\t\t\t\t\t\t\t\t\t\t\t\tsetInlineField(
\t\t\t\t\t\t\t\t\t\t\t\t\t\trow,
\t\t\t\t\t\t\t\t\t\t\t\t\t\t"displayUnit",
\t\t\t\t\t\t\t\t\t\t\t\t\t\tnormalizeUnitOption(e.target.value)
\t\t\t\t\t\t\t\t\t\t\t\t\t)
\t\t\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\t\t\tonKeyDown={(e) => {
\t\t\t\t\t\t\t\t\t\t\t\t\tif (e.key === "Enter") {
\t\t\t\t\t\t\t\t\t\t\t\t\t\tvoid saveMeta(row);
\t\t\t\t\t\t\t\t\t\t\t\t\t\t(e.target as HTMLInputElement).blur();
\t\t\t\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\t\t\t}}
\t\t\t\t\t\t\t\t\t\t\t\tplaceholder={row.unitConversions?.[0]?.unit || "ml / gram"}
\t\t\t\t\t\t\t\t\t\t\t\tvalue={inline.displayUnit}
\t\t\t\t\t\t\t\t\t\t\t/>
\t\t\t\t\t\t\t\t\t\t</td>"""

new_dr = """\t\t\t\t\t\t\t\t\t\t<td className="px-2 py-1.5 align-middle text-[10px] font-semibold text-muted-foreground">{row.preferredStoreName || row.lastPurchaseStoreName || "—"}{row.defaultBrandName ? ` · ${row.defaultBrandName}` : ""}</td>"""

if old_dr in content:
    content = content.replace(old_dr, new_dr, 1)
    changes.append("Replaced DATA ROW brand+toko+ukuran+satuan ukuran with Supplier")
else:
    changes.append("FAILED: DATA ROW brand section not found")
    # Find partial match
    idx = content.find('placeholder="-"')
    if idx >= 0:
        # Find the one after the placeholder
        rem = content[idx:]
        idx2 = rem.find('placeholder="Toko"')
        if idx2 >= 0:
            print(f"  DEBUG: 'Toko' placeholder at abs {idx+idx2}")
            print(f"  Context: ...{content[idx+idx2-50:idx+idx2+250]}...")

# ═══════════════════════════════════════════════════════════════════════════
# 5. Replace DATA ROW - satuan stok unit input to have tooltip
# ═══════════════════════════════════════════════════════════════════════════
old_dr_unit = """\t\t\t\t\t\t\t\t\t\t<td className="px-2 py-1.5 align-middle text-center">
\t\t\t\t\t\t\t\t\t\t\t<input
\t\t\t\t\t\t\t\t\t\t\t\tclassName={`mx-auto w-16 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-center font-semibold text-[10px] text-muted-foreground outline-none focus:border-border focus:bg-background ${getSuggestionHighlightClass(
\t\t\t\t\t\t\t\t\t\t\t\t\tinline.unit.trim() !== "" &&
\t\t\t\t\t\t\t\t\t\t\t\t\t\tunitOptionSet.has(normalizeUnitOption(inline.unit))
\t\t\t\t\t\t\t\t\t\t\t\t)}`}
\t\t\t\t\t\t\t\t\t\t\t\tlist="inventory-unit-options-table"
\t\t\t\t\t\t\t\t\t\t\t\tonBlur={() => void saveMeta(row)}
\t\t\t\t\t\t\t\t\t\t\t\tonChange={(e) =>
\t\t\t\t\t\t\t\t\t\t\t\t\tsetInlineField(
\t\t\t\t\t\t\t\t\t\t\t\t\t\trow,
\t\t\t\t\t\t\t\t\t\t\t\t\t\t"unit",
\t\t\t\t\t\t\t\t\t\t\t\t\t\tnormalizeUnitOption(e.target.value)
\t\t\t\t\t\t\t\t\t\t\t\t\t)
\t\t\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\t\t\tplaceholder="unit"
\t\t\t\t\t\t\t\t\t\t\t\tvalue={inline.unit}
\t\t\t\t\t\t\t\t\t\t\t/>
\t\t\t\t\t\t\t\t\t\t</td>"""

new_dr_unit = """\t\t\t\t\t\t\t\t\t\t<td className="px-2 py-1.5 align-middle text-center group relative">
\t\t\t\t\t\t\t\t\t\t\t<input
\t\t\t\t\t\t\t\t\t\t\t\tclassName={`mx-auto w-16 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-center font-semibold text-[10px] text-muted-foreground outline-none focus:border-border focus:bg-background ${getSuggestionHighlightClass(
\t\t\t\t\t\t\t\t\t\t\t\t\tinline.unit.trim() !== "" &&
\t\t\t\t\t\t\t\t\t\t\t\t\t\tunitOptionSet.has(normalizeUnitOption(inline.unit))
\t\t\t\t\t\t\t\t\t\t\t\t)}`}
\t\t\t\t\t\t\t\t\t\t\t\tlist="inventory-unit-options-table"
\t\t\t\t\t\t\t\t\t\t\t\tonBlur={() => void saveMeta(row)}
\t\t\t\t\t\t\t\t\t\t\t\tonChange={(e) =>
\t\t\t\t\t\t\t\t\t\t\t\t\tsetInlineField(
\t\t\t\t\t\t\t\t\t\t\t\t\t\trow,
\t\t\t\t\t\t\t\t\t\t\t\t\t\t"unit",
\t\t\t\t\t\t\t\t\t\t\t\t\t\tnormalizeUnitOption(e.target.value)
\t\t\t\t\t\t\t\t\t\t\t\t\t)
\t\t\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\t\t\tplaceholder="unit"
\t\t\t\t\t\t\t\t\t\t\t\tvalue={inline.unit}
\t\t\t\t\t\t\t\t\t\t\t/>
\t\t\t\t\t\t\t\t\t\t\t{row.preferredPurchaseUnit && row.preferredPurchaseUnit !== inline.unit && (
\t\t\t\t\t\t\t\t\t\t\t\t<span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap rounded bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-md">Stok: {inline.unit} · Beli: {row.preferredPurchaseUnit}</span>
\t\t\t\t\t\t\t\t\t\t\t)}
\t\t\t\t\t\t\t\t\t\t</td>"""

if old_dr_unit in content:
    content = content.replace(old_dr_unit, new_dr_unit, 1)
    changes.append("Added tooltip to DATA ROW Satuan column")
else:
    changes.append("FAILED: DATA ROW unit td not found")
    idx = content.find('placeholder="unit"')
    if idx >= 0:
        print(f"  DEBUG: 'unit' placeholder at {idx}")
        print(f"  Context: ...{content[idx-200:idx+100]}...")

# ═══════════════════════════════════════════════════════════════════════════
# 6. Remove DATA ROW Satuan Beli td (preferredPurchaseUnit)
# ═══════════════════════════════════════════════════════════════════════════
old_dr_satuan_beli = """\t\t\t\t\t\t\t\t\t\t<td className="px-2 py-1.5 align-middle text-center">
\t\t\t\t\t\t\t\t\t\t\t<input
\t\t\t\t\t\t\t\t\t\t\t\tclassName={`mx-auto w-16 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-center font-semibold text-[10px] text-muted-foreground outline-none focus:border-border focus:bg-background ${getSuggestionHighlightClass(
\t\t\t\t\t\t\t\t\t\t\t\t\tinline.preferredPurchaseUnit.trim() !== "" &&
\t\t\t\t\t\t\t\t\t\t\t\t\t\tunitOptionSet.has(normalizeUnitOption(inline.preferredPurchaseUnit))
\t\t\t\t\t\t\t\t\t\t\t\t)}`}
\t\t\t\t\t\t\t\t\t\t\t\tlist="inventory-unit-options-table"
\t\t\t\t\t\t\t\t\t\t\t\tonBlur={() => void saveMeta(row)}
\t\t\t\t\t\t\t\t\t\t\t\tonChange={(e) =>
\t\t\t\t\t\t\t\t\t\t\t\t\tsetInlineField(
\t\t\t\t\t\t\t\t\t\t\t\t\t\trow,
\t\t\t\t\t\t\t\t\t\t\t\t\t\t"preferredPurchaseUnit",
\t\t\t\t\t\t\t\t\t\t\t\t\t\tnormalizeUnitOption(e.target.value)
\t\t\t\t\t\t\t\t\t\t\t\t\t)
\t\t\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\t\t\tonKeyDown={(e) => {
\t\t\t\t\t\t\t\t\t\t\t\t\tif (e.key === "Enter") {
\t\t\t\t\t\t\t\t\t\t\t\t\t\tvoid saveMeta(row);
\t\t\t\t\t\t\t\t\t\t\t\t\t\t(e.target as HTMLInputElement).blur();
\t\t\t\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\t\t\t}}
\t\t\t\t\t\t\t\t\t\t\t\tplaceholder="-"
\t\t\t\t\t\t\t\t\t\t\t\tvalue={inline.preferredPurchaseUnit}
\t\t\t\t\t\t\t\t\t\t\t/>
\t\t\t\t\t\t\t\t\t\t</td>"""

if old_dr_satuan_beli in content:
    content = content.replace(old_dr_satuan_beli, "", 1)
    changes.append("Removed DATA ROW Satuan Beli td")
else:
    changes.append("FAILED: DATA ROW Satuan Beli td not found")
    idx = content.find('placeholder="-"')
    if idx >= 0:
        # Look for preferredPurchaseUnit
        idx2 = content.find('preferredPurchaseUnit')
        if idx2 >= 0:
            print(f"  DEBUG: 'preferredPurchaseUnit' at {idx2}")

# ═══════════════════════════════════════════════════════════════════════════
# 7. Add Nilai Stok td after Harga Terakhir td
# ═══════════════════════════════════════════════════════════════════════════
old_harga_end = """\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t\t<td className="px-2 py-1.5 align-middle text-center text-[10px]">
\t\t\t\t\t\t\t\t\t\t\t{(() => {"""

new_harga_nilai = """\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t\t<td className="px-2 py-1.5 text-right font-mono text-[11px] font-semibold">{row.lastPurchasePrice ? formatCurrencyIDR(row.currentStock * row.lastPurchasePrice) : "—"}</td>
\t\t\t\t\t\t\t\t\t\t<td className="px-2 py-1.5 align-middle text-center text-[10px]">
\t\t\t\t\t\t\t\t\t\t\t{(() => {"""

if old_harga_end in content:
    content = content.replace(old_harga_end, new_harga_nilai, 1)
    changes.append("Added Nilai Stok column")
else:
    changes.append("FAILED: Harga Terakhir end not found")
    idx = content.find('const tx = row.latestTransaction;')
    if idx >= 0:
        print(f"  DEBUG: 'const tx' at {idx}")
        print(f"  Context before: {content[idx-300:idx]}")

# ═══════════════════════════════════════════════════════════════════════════
# 8. Add date age info to Harga Terakhir
# ═══════════════════════════════════════════════════════════════════════════
old_harga_inner = """\t\t\t\t\t\t\t\t\t\treturn null;
\t\t\t\t\t\t\t\t\t})()}
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t\t<td className="px-2 py-1.5 align-middle text-center text-[10px]">
\t\t\t\t\t\t\t\t\t\t\t{(() => {
\t\t\t\t\t\t\t\t\t\t\t\tconst tx = row.latestTransaction;"""

new_harga_age = """\t\t\t\t\t\t\t\t\t\treturn null;
\t\t\t\t\t\t\t\t\t})()}
\t\t\t\t\t\t\t\t\t\t{(() => {
\t\t\t\t\t\t\t\t\t\t\tif (row.latestTransaction?.timestamp) {
\t\t\t\t\t\t\t\t\t\t\t\tconst daysAgo = Math.floor((Date.now() - new Date(row.latestTransaction.timestamp).getTime()) / (1000 * 60 * 60 * 24));
\t\t\t\t\t\t\t\t\t\t\t\tif (daysAgo <= 1) return <p className="mt-0.5 text-[9px] leading-tight text-muted-foreground/60">(hari ini)</p>;
\t\t\t\t\t\t\t\t\t\t\t\tif (daysAgo <= 7) return <p className="mt-0.5 text-[9px] leading-tight text-muted-foreground/60">({daysAgo} hari lalu)</p>;
\t\t\t\t\t\t\t\t\t\t\t\tif (daysAgo <= 30) return <p className="mt-0.5 text-[9px] leading-tight text-muted-foreground/60">({Math.floor(daysAgo / 7)} minggu lalu)</p>;
\t\t\t\t\t\t\t\t\t\t\t\treturn <p className="mt-0.5 text-[9px] leading-tight text-muted-foreground/60">(bulan lalu)</p>;
\t\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\t\treturn null;
\t\t\t\t\t\t\t\t\t\t})()}
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t\t<td className="px-2 py-1.5 align-middle text-center text-[10px]">
\t\t\t\t\t\t\t\t\t\t\t{(() => {
\t\t\t\t\t\t\t\t\t\t\t\tconst tx = row.latestTransaction;"""

if old_harga_inner in content:
    content = content.replace(old_harga_inner, new_harga_age, 1)
    changes.append("Added price age to Harga Terakhir")
else:
    changes.append("FAILED: Harga Terakhir inner end not found")
    idx = content.find('(row.lastPurchasePrice * row.conversionFactor)')
    if idx >= 0:
        print(f"  DEBUG: Found price calc at {idx}")
        # Find the subsequent </td>
        idx2 = content.find('</td>\n\t\t\t\t\t\t\t\t\t\t<td className="px-2 py-1.5 align-middle text-center text-[10px]">', idx)
        if idx2 >= 0:
            print(f"  Next td at {idx2}")
            print(f"  Gap: {content[idx:idx2+200]}")

# ═══════════════════════════════════════════════════════════════════════════
# 9. Fix colSpan in empty state (14 -> 13)
# ═══════════════════════════════════════════════════════════════════════════
if 'colSpan={14}' in content:
    content = content.replace('colSpan={14}', 'colSpan={13}', 1)
    changes.append("Fixed colSpan 14 -> 13")
else:
    changes.append("FAILED: colSpan={14} not found")

# ═══════════════════════════════════════════════════════════════════════════
# 10. Quick Filter Buttons inside InventoryTable + local statusFilter state
# ═══════════════════════════════════════════════════════════════════════════
# Add statusFilter state inside InventoryTable (after the existing useState declarations)
old_state_anchor = """\tconst [saveStateByRow, setSaveStateByRow] = useState<"""
new_state_with_filter = """\tconst [statusFilter, setStatusFilter] = useState<"all" | "critical" | "warning" | "healthy">("all");
\tconst [saveStateByRow, setSaveStateByRow] = useState<"""

if old_state_anchor in content:
    content = content.replace(old_state_anchor, new_state_with_filter, 1)
    changes.append("Added statusFilter state in InventoryTable")
else:
    changes.append("FAILED: state anchor not found")

# Add filter buttons before thead inside the table
old_thead = """\t\t\t\t\t<thead className="bg-card\">"""
new_filter = """\t\t\t\t\t<div className="mb-2 flex items-center gap-1.5 px-1">
\t\t\t\t\t\t<button
\t\t\t\t\t\t\tclassName={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors ${
\t\t\t\t\t\t\t\tstatusFilter === "all"
\t\t\t\t\t\t\t\t\t? "bg-primary text-primary-foreground"
\t\t\t\t\t\t\t\t\t: "border border-border bg-background text-muted-foreground hover:text-foreground"
\t\t\t\t\t\t\t}`}
\t\t\t\t\t\t\tonClick={() => setStatusFilter("all")}
\t\t\t\t\t\t\ttype="button"
\t\t\t\t\t\t>
\t\t\t\t\t\t\tSemua
\t\t\t\t\t\t</button>
\t\t\t\t\t\t<button
\t\t\t\t\t\t\tclassName={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors ${
\t\t\t\t\t\t\t\tstatusFilter === "critical"
\t\t\t\t\t\t\t\t\t? "bg-rose-600 text-white"
\t\t\t\t\t\t\t\t\t: "border border-border bg-background text-muted-foreground hover:text-foreground"
\t\t\t\t\t\t\t}`}
\t\t\t\t\t\t\tonClick={() => setStatusFilter("critical")}
\t\t\t\t\t\t\ttype="button"
\t\t\t\t\t\t>
\t\t\t\t\t\t\tKritis
\t\t\t\t\t\t</button>
\t\t\t\t\t\t<button
\t\t\t\t\t\t\tclassName={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors ${
\t\t\t\t\t\t\t\tstatusFilter === "warning"
\t\t\t\t\t\t\t\t\t? "bg-amber-500 text-white"
\t\t\t\t\t\t\t\t\t: "border border-border bg-background text-muted-foreground hover:text-foreground"
\t\t\t\t\t\t\t}`}
\t\t\t\t\t\t\tonClick={() => setStatusFilter("warning")}
\t\t\t\t\t\t\ttype="button"
\t\t\t\t\t\t>
\t\t\t\t\t\t\tWarning
\t\t\t\t\t\t</button>
\t\t\t\t\t\t<button
\t\t\t\t\t\t\tclassName={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors ${
\t\t\t\t\t\t\t\tstatusFilter === "healthy"
\t\t\t\t\t\t\t\t\t? "bg-emerald-600 text-white"
\t\t\t\t\t\t\t\t\t: "border border-border bg-background text-muted-foreground hover:text-foreground"
\t\t\t\t\t\t\t}`}
\t\t\t\t\t\t\tonClick={() => setStatusFilter("healthy")}
\t\t\t\t\t\t\ttype="button"
\t\t\t\t\t\t>
\t\t\t\t\t\t\tSehat
\t\t\t\t\t\t</button>
\t\t\t\t\t</div>
\t\t\t\t\t<thead className="bg-card\">"""

if old_thead in content:
    content = content.replace(old_thead, new_filter, 1)
    changes.append("Added Quick Filter Buttons")
else:
    changes.append("FAILED: thead not found")

# ═══════════════════════════════════════════════════════════════════════════
# 11. Add statusFilter to the local data filtering inside InventoryTable
# ── We need to replace the usage of `filteredRows.map` to apply status filter
# ── Since filteredRows is a prop, we create a local filtered version
# ═══════════════════════════════════════════════════════════════════════════
# Find where filteredRows.map is used inside the component
# It's in line 5110: filteredRows.map((row, index) => {
# We need to wrap it with a useMemo that applies statusFilter

# Let's find the first usage of filteredRows.map inside the component
old_map = """{inventoryMap.size > 0 &&
\t\t\t\t\t\t\tfilteredRows.length > 0 &&
\t\t\t\t\t\t\tfilteredRows.map((row, index) => {"""

new_map = """const statusFilteredRows = useMemo(() => {
\t\t\t\t\t\treturn statusFilter === "all"
\t\t\t\t\t\t\t? filteredRows
\t\t\t\t\t\t\t: filteredRows.filter((r) => r.status === statusFilter);
\t\t\t\t\t}, [filteredRows, statusFilter]);
\t\t\t\t\t{inventoryMap.size > 0 &&
\t\t\t\t\t\t\tstatusFilteredRows.length > 0 &&
\t\t\t\t\t\t\tstatusFilteredRows.map((row, index) => {"""

if old_map in content:
    content = content.replace(old_map, new_map, 1)
    changes.append("Added statusFilter local filtering")
else:
    changes.append("FAILED: filteredRows.map not found")
    idx = content.find('filteredRows.map((row, index)')
    if idx >= 0:
        print(f"  DEBUG: found at {idx}")
        print(f"  Context: {content[idx-50:idx+100]}")

# Also need to add the `useMemo` import... it's already imported at line 38
# `import { useEffect, useMemo, useRef, useState } from "react";` - yes, useMemo is already imported

# ─── Also fix the empty state to use statusFilteredRows ───────────────────
old_empty_state = """{inventoryMap.size > 0 && filteredRows.length === 0 && (
\t\t\t\t\t\t\t<tr>
\t\t\t\t\t\t\t\t<td className="p-8 text-center text-muted-foreground" colSpan={13}>"""

new_empty_state = """{inventoryMap.size > 0 && statusFilteredRows.length === 0 && (
\t\t\t\t\t\t\t<tr>
\t\t\t\t\t\t\t\t<td className="p-8 text-center text-muted-foreground" colSpan={13}>"""

if old_empty_state in content:
    content = content.replace(old_empty_state, new_empty_state, 1)
    changes.append("Fixed empty state to use statusFilteredRows")
else:
    changes.append("FAILED: empty state not found (might already be fixed)")
    # Check if filteredRows.length === 0 is still there
    idx = content.find('filteredRows.length === 0')
    if idx >= 0:
        print(f"  DEBUG: old empty pattern still at {idx}")
        print(f"  Context: {content[idx:idx+100]}")

# ═══════════════════════════════════════════════════════════════════════════
# 12. Fix SKELETON LOADING rows (remove 4 skeleton tds)
# ═══════════════════════════════════════════════════════════════════════════
# The skeleton has tds for: No, Bahan, Brand, Toko, Ukuran, Satuan Ukuran, Min, Stock, Satuan Stok, Jml Pembelian, Satuan Beli, Pemakaian, Harga Terakhir, Sumber Restok, Status, Aksi = 16 columns
# New: No, Bahan, Supplier, Min, Stock, Satuan, Jml Beli, Pemakaian, Harga Terakhir, Nilai Stok, Sumber Restok, Status, Aksi = 13 columns
# We need to remove Brand, Toko, Ukuran, Satuan Ukuran skeleton tds and add Supplier, Nilai Stok

# The skeleton currently has these tds (lines 5057-5106):
# td1: Skeleton w-6 (No) - KEEP
# td2: Skeleton w-32 (Bahan) - KEEP
# td3: Skeleton h-8 w-24 (Brand) - REMOVE
# td4: Skeleton w-12 (Toko) - REMOVE
# td5: Skeleton w-20 (Ukuran) - REMOVE
# td6: Skeleton w-16 (Satuan Ukuran) - REMOVE
# td7: Skeleton w-16 (Min) - KEEP
# td8: Skeleton w-16 (Stock) - KEEP (wait, let me recount)

# Looking at the skeleton again:
# 5058: td - Skeleton w-6 (No)
# 5061: td - Skeleton w-32 (Bahan)
# 5064: td - Skeleton h-8 w-24 (Brand) ← REMOVE
# 5067: td - Skeleton w-12 (Toko) ← REMOVE
# 5070: td - Skeleton w-20 (Ukuran) ← REMOVE
# 5073: td - Skeleton w-16 (Satuan Ukuran) ← REMOVE
# 5076: td - Skeleton w-16 (Min)
# 5079: td - Skeleton w-16 (Stock)
# 5082: td - Skeleton h-8 w-24 (Satuan Stok)
# 5085: td - Skeleton w-12 (Jml Pembelian)
# 5088: td - Skeleton w-12 (Satuan Beli)
# 5091: td - Skeleton w-20 (Pemakaian)
# 5094: td - Skeleton w-20 (Harga Terakhir)
# 5097: td - Skeleton w-16 (Sumber Restok)
# 5100: td - Skeleton w-20 (Status)
# 5103: td - Skeleton h-8 w-24 text-right (Aksi)

# New skeleton should be:
# td: Skeleton w-6 (No)
# td: Skeleton w-32 (Bahan)
# td: Skeleton w-24 (Supplier - new)
# td: Skeleton w-16 (Min)
# td: Skeleton w-16 (Stock)
# td: Skeleton w-16 (Satuan)
# td: Skeleton w-12 (Jml Beli)
# td: Skeleton w-20 (Pemakaian)
# td: Skeleton w-20 (Harga Terakhir)
# td: Skeleton w-16 (Nilai Stok - new)
# td: Skeleton w-16 (Sumber Restok)
# td: Skeleton w-20 (Status)
# td: Skeleton h-8 w-24 text-right (Aksi)

# Let me replace the entire skeleton row block
old_skeleton = """\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="mx-auto h-4 w-6" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="h-4 w-32" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="h-8 w-24" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="mx-auto h-4 w-12" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="mx-auto h-4 w-20" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="mx-auto h-4 w-16" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="mx-auto h-8 w-16" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="mx-auto h-8 w-16" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="h-8 w-24" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="mx-auto h-4 w-12" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="mx-auto h-4 w-12" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="h-4 w-20" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="h-4 w-20" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="mx-auto h-4 w-16" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="h-6 w-20" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4 text-right">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="ml-auto h-8 w-24 rounded-lg" />
\t\t\t\t\t\t\t\t\t</td>"""

new_skeleton = """\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="mx-auto h-4 w-6" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="h-4 w-32" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="h-6 w-24" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="mx-auto h-4 w-16" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="mx-auto h-8 w-16" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="mx-auto h-4 w-16" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="mx-auto h-4 w-12" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="h-4 w-20" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="h-4 w-20" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="mx-auto h-4 w-16" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="mx-auto h-4 w-16" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="h-6 w-20" />
\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t<td className="p-4 text-right">
\t\t\t\t\t\t\t\t\t\t<Skeleton className="ml-auto h-8 w-24 rounded-lg" />
\t\t\t\t\t\t\t\t\t</td>"""

if old_skeleton in content:
    content = content.replace(old_skeleton, new_skeleton, 1)
    changes.append("Fixed SKELETON loading rows")
else:
    changes.append("FAILED: skeleton rows not found")
    idx = content.find('Skeleton className="mx-auto h-4 w-6"')
    if idx >= 0:
        print(f"  DEBUG: found Skeleton start at {idx}")
        idx2 = content.find('rounded-lg" />', idx)
        if idx2 >= 0:
            print(f"  DEBUG: skeleton section spans {idx} to {idx2+30}")
            print(f"  Content: {content[idx:idx2+100]}")

# ═══════════════════════════════════════════════════════════════════════════
# Write the file
# ═══════════════════════════════════════════════════════════════════════════
with open(path, "w") as f:
    f.write(content)

print("\n=== CHANGES MADE ===")
for c in changes:
    print(f"  {'✅' if not c.startswith('FAILED') else '❌'} {c}")

print(f"\nFile size: {len(content)} bytes")
print(f"Total lines: {content.count(chr(10))}")
