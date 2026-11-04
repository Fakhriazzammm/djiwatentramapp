import { buildReorderCart, formatOrderDate, pickFeaturedProduct, pickLastCompletedOrder, pickTopSellers, summarizeOrderItems } from "./home-feed";
import type { CustomerOrder } from "./customer-order";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (value: unknown) => any;

const products = new Map<string, Record<string, any>>([
  ["p1", { _id: "p1", name: "Nasi Hamburg Jepang", price: 30000, image: "https://x.test/nasi.jpg", categoryId: "c1", menuNumber: 1031 }],
  ["p2", { _id: "p2", name: "Americano Long Black", price: 30000, image: "/relative.jpg", categoryId: "c2" }],
  ["p3", { _id: "p3", name: "Air Mineral", price: 8000, categoryId: "c3", isAvailable: false }],
]);
const best = [
  { productId: "p1", productName: "Nasi Hamburg Jepang", totalSold: 451 },
  { productId: "p2", productName: "Americano Long Black", totalSold: 278 },
  { productId: "p3", productName: "Air Mineral", totalSold: 100 },
];

const order = (over: Partial<CustomerOrder>): CustomerOrder => ({
  id: "o1", orderNumber: "DT-1", status: "completed", totalAmount: 38000, paymentMethod: null, orderType: null, tableNumber: null, createdAt: Date.UTC(2026, 9, 27, 4, 0, 0),
  items: [{ productId: "p2", productName: "Americano Long Black", quantity: 1, price: 30000 }, { productId: "p3", productName: "Air Mineral", quantity: 1, price: 8000 }],
  ...over,
} as CustomerOrder);

describe("pickFeaturedProduct", () => {
  it("memilih menu terlaris sesuai waktu dan hanya yang tersedia", () => {
    expect(pickFeaturedProduct(best, products, "siang")?.productId).toBe("p1");
    expect(pickFeaturedProduct(best, products, "pagi")?.productId).toBe("p2");
    expect(pickFeaturedProduct(best, products, "malam")?.productId).toBe("p1");
  });

  it("memakai gambar hanya bila URL http(s)", () => {
    expect(pickFeaturedProduct(best, products, "siang")?.image).toBe("https://x.test/nasi.jpg");
    expect(pickFeaturedProduct(best, products, "pagi")?.image).toBe(null);
  });

  it("mengembalikan null bila tidak ada menu yang layak", () => {
    expect(pickFeaturedProduct([], products, "pagi")).toBe(null);
    expect(pickFeaturedProduct(undefined, products, "pagi")).toBe(null);
    expect(pickFeaturedProduct([{ productId: "p3" }], products, "pagi")).toBe(null);
  });

  it("berputar bila daftar hanya satu menu", () => {
    expect(pickFeaturedProduct([best[0]], products, "pagi")?.productId).toBe("p1");
  });
});

describe("pickTopSellers", () => {
  it("mengambil tiga teratas termasuk yang tidak tersedia (ditandai)", () => {
    const top = pickTopSellers(best, products);
    expect(top.length).toBe(3);
    expect(top[2].isAvailable).toBe(false);
  });
});

describe("pickLastCompletedOrder", () => {
  it("melewati pesanan yang belum dibayar", () => {
    const list = [order({ id: "a", status: "pending" }), order({ id: "b", status: "paid" }), order({ id: "c" })];
    expect(pickLastCompletedOrder(list)?.id).toBe("b");
  });

  it("mengembalikan null tanpa pesanan layak", () => {
    expect(pickLastCompletedOrder([])).toBe(null);
    expect(pickLastCompletedOrder([order({ status: "cancelled" })])).toBe(null);
    expect(pickLastCompletedOrder([order({ items: [] })])).toBe(null);
  });
});

describe("buildReorderCart", () => {
  it("memakai harga terkini dan melewati menu tidak tersedia", () => {
    const result = buildReorderCart(order({}), products);
    expect(result.items.length).toBe(1);
    expect(result.items[0].productId).toBe("p2");
    expect(result.items[0].price).toBe(30000);
    expect(result.missing).toBe(1);
  });

  it("menggabungkan baris yang sama dan menjaga jumlah", () => {
    const o = order({ items: [{ productId: "p1", productName: "x", quantity: 2, price: 1 }, { productId: "p1", productName: "x", quantity: 1, price: 1 }] });
    const result = buildReorderCart(o, products);
    expect(result.items.length).toBe(1);
    expect(result.items[0].quantity).toBe(3);
    expect(result.missing).toBe(0);
  });

  it("menghitung menu yang sudah dihapus sebagai missing", () => {
    const o = order({ items: [{ productId: "gone", productName: "Menu Lama", quantity: 2, price: 5000 }] });
    const result = buildReorderCart(o, products);
    expect(result.items.length).toBe(0);
    expect(result.missing).toBe(2);
  });
});

describe("format dan ringkasan", () => {
  it("memformat tanggal bahasa Indonesia", () => {
    expect(formatOrderDate(Date.UTC(2026, 9, 27, 4, 0, 0))).toBe("27 Okt 2026");
  });

  it("meringkas nama item", () => {
    expect(summarizeOrderItems(order({}))).toBe("Americano Long Black + Air Mineral");
    const three = order({ items: [1, 2, 3].map((n) => ({ productId: `p${n}`, productName: `Menu ${n}`, quantity: 1, price: 1 })) });
    expect(summarizeOrderItems(three)).toBe("Menu 1 + Menu 2 +1 lagi");
  });
});
