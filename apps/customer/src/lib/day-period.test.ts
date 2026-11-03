import { getDayPeriod, greetingForPeriod, isDayPeriod, msUntilNextPeriod } from "./day-period";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (value: unknown) => any;

const at = (hour: number, minute = 0, second = 0) => new Date(2026, 10, 4, hour, minute, second, 0);

describe("getDayPeriod", () => {
  it("memetakan jam ke pagi, siang, sore, malam", () => {
    expect(getDayPeriod(at(5, 0))).toBe("pagi");
    expect(getDayPeriod(at(10, 59))).toBe("pagi");
    expect(getDayPeriod(at(11, 0))).toBe("siang");
    expect(getDayPeriod(at(14, 59))).toBe("siang");
    expect(getDayPeriod(at(15, 0))).toBe("sore");
    expect(getDayPeriod(at(17, 59))).toBe("sore");
    expect(getDayPeriod(at(18, 0))).toBe("malam");
  });

  it("menganggap 00.00 sampai 04.59 sebagai malam, bukan pagi", () => {
    expect(getDayPeriod(at(0, 0))).toBe("malam");
    expect(getDayPeriod(at(3, 30))).toBe("malam");
    expect(getDayPeriod(at(4, 59))).toBe("malam");
  });
});

describe("greetingForPeriod", () => {
  it("menyusun sapaan bahasa Indonesia", () => {
    expect(greetingForPeriod("sore")).toBe("Selamat sore");
  });
});

describe("isDayPeriod", () => {
  it("menolak nilai di luar empat waktu", () => {
    expect(isDayPeriod("malam")).toBe(true);
    expect(isDayPeriod("subuh")).toBe(false);
    expect(isDayPeriod(undefined)).toBe(false);
  });
});

describe("msUntilNextPeriod", () => {
  it("menghitung ke batas berikutnya pada hari yang sama", () => {
    expect(msUntilNextPeriod(at(10, 59, 0))).toBe(60_000);
    expect(msUntilNextPeriod(at(14, 0, 0))).toBe(3_600_000);
    expect(msUntilNextPeriod(at(17, 0, 0))).toBe(3_600_000);
  });

  it("melewati tengah malam ke pukul 05.00 berikutnya", () => {
    expect(msUntilNextPeriod(at(23, 0, 0))).toBe(6 * 3_600_000);
    expect(msUntilNextPeriod(at(2, 0, 0))).toBe(3 * 3_600_000);
  });
});
