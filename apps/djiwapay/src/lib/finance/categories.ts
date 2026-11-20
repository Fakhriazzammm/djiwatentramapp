import type { Account, Category } from "./types";

export const PAY_ACCOUNT_ID = "pay";

type Def = [id: string, name: string, icon: string, tone: string, subs: string[]];
/** Parents first (the original ids are kept so old records and budgets stay valid), each with the sub categories that say where the money went. */
const OUT: Def[] = [
  ["makan", "Makan & minum", "cup", "orange", ["Restoran & warung", "Kopi & minuman", "Belanja dapur", "Pesan antar", "Jajan & camilan"]],
  ["transport", "Transportasi", "car", "blue", ["BBM", "Ojek & taksi online", "Parkir & tol", "Servis kendaraan", "Transportasi umum"]],
  ["belanja", "Belanja", "bag", "violet", ["Belanja online", "Pakaian & sepatu", "Elektronik & gadget", "Perabot & dekorasi", "Kebutuhan harian"]],
  ["tagihan", "Tagihan & utilitas", "receipt", "amber", ["Listrik & air", "Internet & TV kabel", "Pulsa & paket data", "Asuransi & BPJS", "Cicilan & kartu kredit", "Langganan digital"]],
  ["hiburan", "Hiburan", "game", "rose", ["Streaming & game", "Bioskop & konser", "Hobi & olahraga"]],
  ["kesehatan", "Kesehatan", "heart", "rose", ["Dokter & klinik", "Obat & apotek", "Rumah sakit", "Vitamin & suplemen"]],
  ["pendidikan", "Pendidikan", "book", "indigo", ["Sekolah & kuliah", "Kursus & pelatihan", "Buku & alat tulis"]],
  ["rumah", "Rumah", "home", "cyan", ["Sewa & KPR", "Perbaikan rumah", "Kebersihan & ART", "Iuran & keamanan"]],
  ["keluarga", "Keluarga & anak", "users", "emerald", ["Kebutuhan anak", "Orang tua & pasangan", "Acara keluarga"]],
  ["perawatan", "Perawatan diri", "spark", "rose", ["Salon & barbershop", "Skincare & kosmetik", "Spa & pijat"]],
  ["hewan", "Hewan peliharaan", "heart", "amber", ["Makanan hewan", "Dokter hewan"]],
  ["liburan", "Liburan & perjalanan", "send", "cyan", ["Hotel & penginapan", "Tiket perjalanan", "Wisata & oleh-oleh"]],
  ["donasi", "Donasi & hadiah", "gift", "emerald", ["Zakat & infak", "Sedekah & donasi", "Kado & angpao"]],
  ["investasi", "Investasi & tabungan", "trend", "indigo", ["Saham & reksa dana", "Emas", "Tabungan & dana darurat"]],
  ["usaha", "Biaya usaha", "bag", "slate", ["Bahan baku & stok", "Gaji karyawan", "Sewa & operasional", "Iklan & marketing", "Ongkir & kemasan"]],
  ["lainnya", "Lainnya", "tag", "slate", ["Biaya admin & pajak"]],
];
const IN: Def[] = [
  ["gaji", "Gaji", "down", "emerald", ["Gaji pokok", "Tunjangan & lembur", "THR"]],
  ["bonus", "Bonus & lainnya", "gift", "emerald", ["Bonus kerja", "Pemasukan lain-lain"]],
  ["penjualan", "Penjualan & usaha", "bag", "amber", ["Penjualan produk", "Jasa & komisi"]],
  ["freelance", "Freelance", "phone", "blue", ["Proyek freelance"]],
  ["hasil-investasi", "Hasil investasi", "trend", "indigo", ["Dividen & kupon", "Bunga tabungan", "Untung jual aset"]],
  ["hadiah", "Hadiah & angpao", "gift", "rose", ["Hadiah & angpao diterima"]],
  ["refund", "Refund & cashback", "repeat", "cyan", ["Refund & pengembalian", "Cashback & reward"]],
];
const slug = (s: string) => s.toLowerCase().replace(/&/g, "dan").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const expand = (defs: Def[], income: boolean): Category[] => defs.flatMap(([id, name, icon, tone, subs]) => [{ id, name, icon, tone, income }, ...subs.map((sub) => ({ id: `${id}-${slug(sub)}`, name: sub, icon, tone, income, parentId: id }))]);

export const DEFAULT_CATEGORIES: Category[] = [
  ...expand(OUT.filter(([id]) => id !== "lainnya"), false),
  { id: "transfer", name: "Transfer", icon: "send", tone: "slate", income: false },
  ...expand(OUT.filter(([id]) => id === "lainnya"), false),
  ...expand(IN, true),
];

/** Maps every category id to its top-level parent (a parent maps to itself). Unknown ids map to themselves. */
export const parentMap = (categories: Category[]): Record<string, string> => { const m: Record<string, string> = {}; for (const c of categories) m[c.id] = c.parentId && categories.some((p) => p.id === c.parentId) ? c.parentId : c.id; return m; };
export const rootId = (categories: Category[], id: string) => parentMap(categories)[id] ?? id;
export const subsOf = (categories: Category[], parentId: string) => categories.filter((c) => c.parentId === parentId);

export const DEFAULT_ACCOUNTS: Account[] = [{ id: "tunai", name: "Tunai", type: "cash", opening: 0 }];

/** Words that point to a category. First match wins; order matters (specific before generic). */
export const KEYWORDS: [string, string[]][] = [
  ["gaji", ["gaji", "salary", "payroll"]],
  ["transfer", ["transfer", "top up", "topup", "isi saldo", "gopay", "ovo", "dana", "linkaja", "shopeepay"]],
  ["bonus", ["bonus", "thr", "komisi", "cashback", "hadiah", "untung", "jual"]],
  ["transport", ["parkir", "bensin", "pertalite", "pertamax", "ojek", "gojek", "grab", "tol", "bus", "krl", "kereta", "taksi", "taxi", "angkot", "transjakarta", "mrt", "lrt", "spbu", "pertamina", "shell", "e-toll", "bluebird", "servis motor", "tambal"]],
  ["tagihan", ["listrik", "pln", "token", "pulsa", "paket data", "kuota", "internet", "wifi", "indihome", "air", "pdam", "bpjs", "cicilan", "tagihan"]],
  ["kesehatan", ["obat", "dokter", "apotek", "klinik", "rumah sakit", "vitamin", "dentist", "gigi"]],
  ["hiburan", ["nonton", "bioskop", "netflix", "spotify", "youtube", "game", "konser", "karaoke", "liburan", "wisata"]],
  ["pendidikan", ["buku", "kursus", "spp", "kuliah", "sekolah", "les", "seminar"]],
  ["rumah", ["sewa", "kos", "kontrakan", "perabot", "galon", "gas", "renovasi", "kebersihan"]],
  ["belanja", ["belanja", "indomaret", "alfamart", "supermarket", "baju", "sepatu", "shopee", "tokopedia", "lazada", "tas", "kosmetik", "mart", "toko", "minimarket", "blibli", "zalora", "tiktok", "skincare"]],
  ["makan", ["kopi", "makan", "minum", "bakso", "nasi", "ayam", "sarapan", "lunch", "dinner", "snack", "jajan", "burger", "kfc", "mcd", "mcdonald", "pizza", "geprek", "seblak", "martabak", "bakmi", "bakso", "kedai", "depot", "cafe", "coffee", "sushi", "dimsum", "kebab", "donat", "bakery", "warung", "catering", "resto", "gofood", "grabfood", "roti", "teh", "boba", "mie", "soto", "padang", "gudeg", "pecel", "bebek", "sop", "sate", "es"]],
];
export const INCOME_HINTS = ["gaji", "bonus", "thr", "terima", "dapat", "masuk", "jual", "untung", "cashback", "komisi", "hadiah", "bayaran", "dibayar"];

export const TONES = ["orange", "blue", "violet", "amber", "rose", "indigo", "cyan", "emerald", "slate"] as const;
export const CATEGORY_ICONS = ["cup", "car", "bag", "receipt", "game", "heart", "book", "home", "send", "tag", "gift", "phone", "flash", "tv"] as const;

export function guessCategory(text: string): string | null {
  const t = ` ${text.toLowerCase()} `;
  for (const [id, words] of KEYWORDS) if (words.some((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(t))) return id;
  return null;
}
