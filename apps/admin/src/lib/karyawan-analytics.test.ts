import { describe, expect, it } from "bun:test";
import { analyzeAttendance, profileCompleteness, wibParts } from "./karyawan-analytics";

// 2026-11-16 (Senin) 07:00 WIB = 00:00 UTC
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+07:00`).getTime();
const start = at("2026-11-16", "00:00");
const end = at("2026-11-23", "00:00");

describe("analisis kehadiran", () => {
	const sched = [{ userId: "a", date: "2026-11-16", shiftName: "Pagi", startTime: "07:00" }];

	it("mendeteksi keterlambatan di atas toleransi", () => {
		const r = analyzeAttendance([{ userId: "a", type: "check_in", timestamp: at("2026-11-16", "07:19") }, { userId: "a", type: "check_out", timestamp: at("2026-11-16", "15:00") }], sched, { start, end, bucket: "day", now: at("2026-11-20", "10:00") });
		expect(r.lateCount).toBe(1);
		expect(r.lateAvgMin).toBe(19);
		expect(r.byUser.a.onTimePct).toBe(0);
	});

	it("toleransi 10 menit tidak dihitung terlambat", () => {
		const r = analyzeAttendance([{ userId: "a", type: "check_in", timestamp: at("2026-11-16", "07:08") }, { userId: "a", type: "check_out", timestamp: at("2026-11-16", "15:00") }], sched, { start, end, bucket: "day", now: at("2026-11-20", "10:00") });
		expect(r.lateCount).toBe(0);
		expect(r.presence).toBe(1);
	});

	it("sesi tanpa check-out lama dihitung belum ditutup dan tidak menambah jam", () => {
		const r = analyzeAttendance([{ userId: "a", type: "check_in", timestamp: at("2026-11-16", "07:00") }], sched, { start, end, bucket: "day", now: at("2026-11-20", "10:00") });
		expect(r.unclosed).toBe(1);
		expect(r.byUser.a.hours).toBe(0);
	});

	it("sesi yang berlangsung hari ini dihitung sedang bekerja", () => {
		const now = at("2026-11-20", "10:00");
		const r = analyzeAttendance([{ userId: "b", type: "check_in", timestamp: at("2026-11-20", "08:00") }], [], { start: at("2026-11-16", "00:00"), end: at("2026-11-23", "00:00"), bucket: "day", now });
		expect(r.workingNow).toEqual(["b"]);
		expect(r.unclosed).toBe(0);
	});

	it("peta panas memakai hari dan jam WIB", () => {
		const r = analyzeAttendance([{ userId: "a", type: "check_in", timestamp: at("2026-11-17", "07:30") }, { userId: "a", type: "check_out", timestamp: at("2026-11-17", "15:00") }], [], { start, end, bucket: "day", now: at("2026-11-20", "10:00") });
		expect(r.heat[1][1]).toBe(1);
		expect(wibParts(at("2026-11-22", "23:30")).weekday).toBe(6);
	});

	it("kelengkapan profil menghitung field terisi", () => {
		const r = profileCompleteness({ raw: { phone: "08", employmentType: "full_time", monthlySalary: 1000, contracts: [{ pdfUrl: "x" }] } });
		expect(r.percent).toBe(44);
		expect(r.missing).toContain("Alamat");
	});
});
