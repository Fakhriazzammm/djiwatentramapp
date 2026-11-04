import {
  displayDonorName, donationAmount, formatCountdown, formatDistributionDate, orderPrayersForBanner, progressPercent,
  resolvePhotoUrl, stepIndex, validatePortions, validatePrayer, type JumatBerkahPrayer,
} from "./jumat-berkah-logic";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (value: unknown) => any;

const prayer = (id: string, over: Partial<JumatBerkahPrayer> = {}): JumatBerkahPrayer => ({
  prayerId: id, displayName: "Hamba Allah", body: `doa ${id}`, portions: null, aminCount: 0, aminByMe: false, isPinned: false, createdAt: "", ...over,
});

describe("jumat berkah amounts", () => {
  it("menghitung nominal dan persen", () => {
    expect(donationAmount(5, 15000)).toBe(75000);
    expect(donationAmount(-2, 15000)).toBe(0);
    expect(progressPercent(64, 100)).toBe(64);
    expect(progressPercent(150, 100)).toBe(100);
    expect(progressPercent(5, 0)).toBe(0);
  });

  it("memvalidasi porsi terhadap batas dan kuota", () => {
    expect(validatePortions(5, 100, 95).ok).toBe(true);
    expect(validatePortions(0, 100, 95).ok).toBe(false);
    expect(validatePortions(101, 100, 200).message).toContain("Maksimal 100");
    expect(validatePortions(10, 100, 4).message).toContain("tersisa 4");
    expect(validatePortions(1, 100, 0).message).toContain("penuh");
  });
});

describe("jumat berkah prayers", () => {
  it("memvalidasi panjang doa dan merapikan spasi", () => {
    expect(validatePrayer("  Semoga   berkah  ").text).toBe("Semoga berkah");
    expect(validatePrayer("x".repeat(141)).ok).toBe(false);
    expect(validatePrayer("x".repeat(140)).ok).toBe(true);
  });

  it("menampilkan Hamba Allah atau nama depan", () => {
    expect(displayDonorName(false, "Azzam Tester")).toBe("Hamba Allah");
    expect(displayDonorName(true, "Azzam Tester")).toBe("Azzam");
    expect(displayDonorName(true, "")).toBe("Sahabat Djiwa");
  });

  it("mengurutkan doa untuk banner: disematkan dulu, deterministik, tidak kehilangan doa", () => {
    const list = [prayer("a"), prayer("b", { isPinned: true }), prayer("c"), prayer("d")];
    const one = orderPrayersForBanner(list, 7);
    const two = orderPrayersForBanner(list, 7);
    expect(one[0].prayerId).toBe("b");
    expect(one.map((p) => p.prayerId)).toEqual(two.map((p) => p.prayerId));
    expect(one.map((p) => p.prayerId).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("berputar melingkar maju dan mundur", () => {
    expect(stepIndex(2, 3, 1)).toBe(0);
    expect(stepIndex(0, 3, -1)).toBe(2);
    expect(stepIndex(0, 0, 1)).toBe(0);
  });
});

describe("jumat berkah dates and urls", () => {
  it("memformat hitung mundur", () => {
    const now = Date.parse("2026-11-04T10:00:00+07:00");
    expect(formatCountdown("2026-11-05T21:00:00+07:00", now)).toBe("Tutup dalam 1 hari 11 jam");
    expect(formatCountdown("2026-11-04T15:20:00+07:00", now)).toBe("Tutup dalam 5 jam 20 menit");
    expect(formatCountdown("2026-11-04T10:12:00+07:00", now)).toBe("Tutup dalam 12 menit");
    expect(formatCountdown("2026-11-04T09:00:00+07:00", now)).toBe("Pesanan ditutup");
  });

  it("memformat tanggal Jumat dan membangun URL foto", () => {
    expect(formatDistributionDate("2026-11-06")).toContain("Jumat");
    expect(formatDistributionDate("")).toBe("");
    expect(resolvePhotoUrl("gallery/a.jpg", "https://x.test/")).toBe("https://x.test/storage/v1/object/public/jumat-berkah/gallery/a.jpg");
    expect(resolvePhotoUrl("https://cdn.test/a.jpg", "https://x.test")).toBe("https://cdn.test/a.jpg");
  });
});
