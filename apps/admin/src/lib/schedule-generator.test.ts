import { describe, expect, it } from "bun:test";
import { addDays, generateSchedule, isOffDay, mondayOf, offDaysOf, planOffBlocks, validateConsecutive, weekdayIndex, type GeneratorStaff } from "./schedule-generator";

const staff = (n: number, daysOff: 1 | 2 = 2): GeneratorStaff[] => Array.from({ length: n }, (_, i) => ({ id: `u${i}`, name: `Orang ${i}`, daysOff }));
const shifts = [
	{ name: "Pagi", start: "07:00", end: "15:00", minStaff: 1 },
	{ name: "Sore", start: "14:00", end: "22:00", minStaff: 1 },
];

describe("schedule generator", () => {
	it("menghitung hari dalam pekan dengan Senin sebagai awal", () => {
		expect(weekdayIndex("2026-11-16")).toBe(0);
		expect(weekdayIndex("2026-11-22")).toBe(6);
		expect(mondayOf("2026-11-20")).toBe("2026-11-16");
		expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
	});

	it("blok libur melingkar", () => {
		expect(offDaysOf(5, 2)).toEqual([5, 6]);
		expect(offDaysOf(6, 2)).toEqual([6, 0]);
		expect(isOffDay(6, 2, 0)).toBe(true);
		expect(isOffDay(6, 2, 1)).toBe(false);
	});

	it("setiap orang memiliki jatah libur sesuai permintaan dan berjejer", () => {
		const people: GeneratorStaff[] = [...staff(4, 2), ...staff(3, 1).map((s) => ({ ...s, id: `s${s.id}` }))];
		const result = generateSchedule({ startDate: "2026-11-16", weeks: 4, staff: people, shifts });
		for (const person of people) {
			const mine = result.rows.filter((r) => r.userId === person.id);
			expect(mine.length).toBe(28);
			const offPerWeek = mine.slice(0, 7).filter((r) => r.status === "off").length;
			expect(offPerWeek).toBe(person.daysOff);
			expect(validateConsecutive(result.rows, person.id).ok).toBe(true);
		}
	});

	it("beban libur seimbang agar tiap hari ada yang masuk", () => {
		const result = generateSchedule({ startDate: "2026-11-16", weeks: 1, staff: staff(8, 2), shifts });
		const min = Math.min(...result.workingPerWeekday);
		const max = Math.max(...result.workingPerWeekday);
		expect(max - min <= 2).toBe(true);
		expect(min >= 5).toBe(true);
	});

	it("menghormati hari yang tidak boleh libur dan permintaan libur", () => {
		const people: GeneratorStaff[] = [
			{ id: "a", name: "A", daysOff: 2, preferredOffStart: 5 },
			{ id: "b", name: "B", daysOff: 2, noOffDays: [5, 6] },
		];
		const blocks = planOffBlocks(people);
		expect(blocks.a).toBe(5);
		expect(offDaysOf(blocks.b, 2).some((d) => d === 5 || d === 6)).toBe(false);
	});

	it("shift tetap dalam satu pekan dan bergilir bila rotasi aktif", () => {
		const fixed = generateSchedule({ startDate: "2026-11-16", weeks: 2, staff: staff(2, 2), shifts });
		const shiftsWeek1 = new Set(fixed.rows.filter((r) => r.userId === "u0" && r.status === "scheduled" && r.date < "2026-11-23").map((r) => r.shiftName));
		expect(shiftsWeek1.size).toBe(1);
		const rotating = generateSchedule({ startDate: "2026-11-16", weeks: 2, staff: staff(2, 2), shifts, rotateWeekly: true });
		const w1 = rotating.rows.find((r) => r.userId === "u0" && r.status === "scheduled" && r.date < "2026-11-23")?.shiftName;
		const w2 = rotating.rows.find((r) => r.userId === "u0" && r.status === "scheduled" && r.date >= "2026-11-23")?.shiftName;
		expect(w1 !== w2).toBe(true);
	});

	it("melaporkan kekurangan cakupan shift", () => {
		const result = generateSchedule({ startDate: "2026-11-16", weeks: 1, staff: staff(1, 2), shifts: [{ name: "Pagi", start: null, end: null, minStaff: 2 }] });
		expect(result.warnings.length > 0).toBe(true);
	});

	it("baris libur memakai status off dan nama OFF", () => {
		const result = generateSchedule({ startDate: "2026-11-16", weeks: 1, staff: staff(3, 1), shifts });
		const off = result.rows.filter((r) => r.status === "off");
		expect(off.length).toBe(3);
		expect(off.every((r) => r.shiftName === "OFF" && r.startTime === null)).toBe(true);
	});
});
