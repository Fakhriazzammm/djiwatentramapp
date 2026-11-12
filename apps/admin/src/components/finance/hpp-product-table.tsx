import { useState } from "react";
import { useHybridRecipes } from "@/hooks/use-hybrid-inventory-admin-data";
import { useHybridLatestInventoryCosts } from "@/hooks/use-hybrid-pos-data";
import {
  useHybridAllProducts,
  useHybridHppProductMap,
} from "@/hooks/use-hybrid-pos-data";
import { FinanceDataTable } from "./finance-data-table";
import { Skeleton } from "@/components/ui/skeleton";
const money = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
export function HppProductTable({
  onSelect,
}: {
  onSelect: (id: string) => void;
}) {
  const [tab, setTab] = useState("products");
  const recipes = useHybridRecipes() as
    | Array<{
        _id: string;
        productId: string;
        variantName?: string | null;
        ingredients: Array<{ inventoryId: string; amount: number }>;
      }>
    | null
    | undefined;
  const costs = useHybridLatestInventoryCosts();
  const products = useHybridAllProducts();
  const hpp = useHybridHppProductMap();
  if (products === null || hpp === null)
    return (
      <p role="alert">
        Data HPP gagal dimuat. Muat ulang halaman untuk mencoba lagi.
      </p>
    );
  if (!products || !hpp) return <Skeleton className="h-40 w-full" />;
  const rows = products.map((p) => ({
    id: p._id,
    name: p.name,
    price: p.promoPrice ?? p.price,
    cost: hpp[p._id]?.hppPerServing ?? null,
    calculation: hpp[p._id]?.name ?? "Belum dihitung",
  }));
  const tabs = (
    <nav aria-label="Data HPP" className="flex gap-1 border-b py-2">
      {[
        ["products", "HPP produk"],
        ["recipes", "Resep & bahan"],
        ["prices", "Harga bahan"],
      ].map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-pressed={tab === id}
          className={`border px-3 py-2 text-xs ${tab === id ? "bg-black text-white" : "bg-white"}`}
          onClick={() => setTab(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
  if (tab === "prices")
    return (
      <section>
        {tabs}
        <h1 className="mt-4 text-xl font-semibold">Harga bahan terakhir</h1>
        {!costs ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <FinanceDataTable
            label="Harga bahan"
            rows={Object.values(costs)}
            rowKey={(r) => r.inventoryId}
            columns={[
              { key: "name", label: "Bahan", value: (r) => r.ingredientName },
              { key: "unit", label: "Satuan dasar", value: (r) => r.unit },
              {
                key: "display",
                label: "Satuan tampilan",
                value: (r) => r.displayUnit ?? "—",
              },
              {
                key: "factor",
                label: "Faktor konversi",
                value: (r) => r.conversionFactor ?? "—",
              },
              {
                key: "cost",
                label: "Biaya / satuan dasar",
                value: (r) => r.latestCostPerUnit ?? "",
                render: (r) =>
                  r.latestCostPerUnit == null
                    ? "Belum tersedia"
                    : money(r.latestCostPerUnit),
              },
              {
                key: "average",
                label: "Rata-rata / satuan dasar",
                value: (r) => r.avgCostPerUnit ?? "",
                render: (r) =>
                  r.avgCostPerUnit == null ? "—" : money(r.avgCostPerUnit),
              },
              {
                key: "date",
                label: "Restock terakhir",
                value: (r) => r.latestRestockDate ?? "",
                render: (r) =>
                  r.latestRestockDate
                    ? new Date(r.latestRestockDate).toLocaleDateString("id-ID")
                    : "—",
              },
            ]}
          />
        )}
      </section>
    );
  if (tab === "recipes") {
    const ingredients = (recipes ?? []).flatMap((r) =>
      r.ingredients.map((i, index) => ({
        id: r._id + ":" + index,
        productId: r.productId,
        product:
          products.find((p) => p._id === r.productId)?.name ?? r.productId,
        variant: r.variantName ?? "Utama",
        ingredient: costs?.[i.inventoryId]?.ingredientName ?? i.inventoryId,
        amount: i.amount,
      })),
    );
    return (
      <section>
        {tabs}
        <h1 className="mt-4 text-xl font-semibold">Komposisi resep</h1>
        {!recipes ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <FinanceDataTable
            label="Bahan resep"
            rows={ingredients}
            rowKey={(r) => r.id}
            onSelect={(r) => onSelect(r.productId)}
            columns={[
              { key: "product", label: "Produk", value: (r) => r.product },
              {
                key: "variant",
                label: "Varian resep",
                value: (r) => r.variant,
              },
              { key: "ingredient", label: "Bahan", value: (r) => r.ingredient },
              {
                key: "amount",
                label: "Takaran tersimpan",
                value: (r) => r.amount,
              },
            ]}
          />
        )}
      </section>
    );
  }
  return (
    <section>
      {tabs}
      <h1 className="text-2xl font-semibold">Harga pokok produk</h1>
      <p className="finance-summary-line">
        Pilih produk untuk membuka resep, memperbarui biaya, dan menyimpan
        perhitungan HPP. Biaya memakai perhitungan tersimpan terakhir.
      </p>
      <FinanceDataTable
        rows={rows}
        rowKey={(r) => r.id}
        onSelect={(r) => onSelect(r.id)}
        label="HPP produk"
        columns={[
          { key: "name", label: "Produk", value: (r) => r.name },
          {
            key: "price",
            label: "Harga jual aktif",
            value: (r) => r.price,
            render: (r) => money(r.price),
          },
          {
            key: "hpp",
            label: "HPP / porsi",
            value: (r) => r.cost ?? "",
            render: (r) => (r.cost === null ? "Belum dihitung" : money(r.cost)),
          },
          {
            key: "profit",
            label: "Laba kotor / porsi",
            value: (r) => (r.cost === null ? "" : r.price - r.cost),
            render: (r) => (r.cost === null ? "—" : money(r.price - r.cost)),
          },
          {
            key: "margin",
            label: "Margin kotor",
            value: (r) =>
              r.cost === null || r.price <= 0
                ? ""
                : ((r.price - r.cost) / r.price) * 100,
            render: (r) =>
              r.cost === null || r.price <= 0
                ? "—"
                : (((r.price - r.cost) / r.price) * 100).toFixed(1) + "%",
          },
          {
            key: "food",
            label: "HPP / harga jual",
            value: (r) =>
              r.cost === null || r.price <= 0 ? "" : (r.cost / r.price) * 100,
            render: (r) =>
              r.cost === null || r.price <= 0
                ? "—"
                : ((r.cost / r.price) * 100).toFixed(1) + "%",
          },
          {
            key: "recipe",
            label: "Perhitungan tersimpan",
            value: (r) => r.calculation,
          },
          {
            key: "status",
            label: "Status",
            value: (r) =>
              r.cost === null
                ? "Perlu perhitungan"
                : r.price <= r.cost
                  ? "Margin tidak positif"
                  : "Tersedia",
          },
        ]}
      />
    </section>
  );
}
