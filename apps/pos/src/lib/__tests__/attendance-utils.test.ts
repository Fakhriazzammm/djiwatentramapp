import { describe, expect, it } from "bun:test";
import {
	buildAttendanceSessions,
	euclideanDistance,
	getActiveShiftSchedule,
	getDetectedShiftSchedule,
	isCurrentlyWorking,
	isFaceDescriptorMatch,
} from "../attendance-utils";

describe("attendance utilities", () => {
	it("matches face descriptors only when distance is below threshold", () => {
		expect(euclideanDistance([0, 0], [3, 4])).toBe(5);
		expect(isFaceDescriptorMatch([0, 0], [0.1, 0.1], 0.6)).toBe(true);
		expect(isFaceDescriptorMatch([0, 0], [1, 1], 0.6)).toBe(false);
		expect(isFaceDescriptorMatch([0], [0, 1], 0.6)).toBe(false);
	});

	it("returns active shift for current time and never treats upcoming shift as active", () => {
		const schedules = [
			{ name: "Shift Pagi", openTime: "07:30", closeTime: "12:00" },
			{ name: "Shift Sore", openTime: "13:00", closeTime: "21:00" },
		];

		const active = getActiveShiftSchedule(schedules, new Date(2026, 3, 28, 8, 0));
		const inactive = getActiveShiftSchedule(schedules, new Date(2026, 3, 28, 12, 30));
		const detected = getDetectedShiftSchedule(schedules, new Date(2026, 3, 28, 12, 30));

		expect(active?.name).toBe("Shift Pagi");
		expect(inactive).toBe(null);
		expect(detected?.name).toBe("Shift Sore");
		expect((detected as any).upcoming).toBe(true);
	});

	it("supports overnight active shift windows", () => {
		const schedules = [{ name: "Shift Malam", openTime: "22:00", closeTime: "06:00" }];
		expect(getActiveShiftSchedule(schedules, new Date(2026, 3, 28, 23, 0))?.name).toBe("Shift Malam");
		expect(getActiveShiftSchedule(schedules, new Date(2026, 3, 28, 5, 30))?.name).toBe("Shift Malam");
		expect(getActiveShiftSchedule(schedules, new Date(2026, 3, 28, 12, 0))).toBe(null);
	});

	it("pairs attendance logs into sessions and closes duplicate check-ins at the replacement timestamp", () => {
		const logs = [
			{ _id: "out-1", type: "check_out", timestamp: 1_800 },
			{ _id: "in-1", type: "check_in", timestamp: 1_000 },
			{ _id: "in-2", type: "check_in", timestamp: 2_000 },
			{ _id: "in-3", type: "check_in", timestamp: 3_000 },
		];

		const sessions = buildAttendanceSessions(logs, 4_000);

		expect(sessions.length).toBe(3);
		expect({ startTime: sessions[0].startTime, endTime: sessions[0].endTime, durationMs: sessions[0].durationMs, isOpen: sessions[0].isOpen }).toEqual({ startTime: 1_000, endTime: 1_800, durationMs: 800, isOpen: false });
		expect({ startTime: sessions[1].startTime, endTime: sessions[1].endTime, durationMs: sessions[1].durationMs, isOpen: sessions[1].isOpen }).toEqual({ startTime: 2_000, endTime: 3_000, durationMs: 1_000, isOpen: false });
		expect({ startTime: sessions[2].startTime, endTime: sessions[2].endTime, durationMs: sessions[2].durationMs, isOpen: sessions[2].isOpen }).toEqual({ startTime: 3_000, endTime: null, durationMs: 1_000, isOpen: true });
	});

	it("ignores malformed shift times and invalid timestamps safely", () => {
		const malformedTimes = [":", "08:", ":30", "08:30:00", "  ", "99:99"];
		for (const badTime of malformedTimes) {
			expect(getActiveShiftSchedule([{ name: "Rusak", openTime: badTime, closeTime: "12:00" }], new Date(2026, 3, 28, 8, 0))).toBe(null);
			expect(getDetectedShiftSchedule([{ name: "Rusak", openTime: "10:00", closeTime: badTime }], new Date(2026, 3, 28, 8, 0))).toBe(null);
		}
		expect(getActiveShiftSchedule([{ name: "Valid", openTime: "00:00", closeTime: "23:59" }], new Date(2026, 3, 28, 8, 0))?.name).toBe("Valid");
		const invalidLogs = [
			{ type: "check_in", timestamp: "not-a-number" },
			{ type: "check_in", timestamp: null },
			{ type: "check_in", timestamp: "" },
			{ type: "check_in", timestamp: "   " },
		];
		expect(buildAttendanceSessions(invalidLogs, 4_000).length).toBe(0);
		expect(isCurrentlyWorking(invalidLogs)).toBe(false);
	});

	it("derives working state from the latest valid attendance log", () => {
		expect(isCurrentlyWorking([{ type: "check_in", timestamp: 100 }])).toBe(true);
		expect(isCurrentlyWorking([{ type: "check_in", timestamp: 100 }, { type: "check_out", timestamp: 200 }])).toBe(false);
		expect(isCurrentlyWorking([{ type: "check_out", timestamp: 100 }, { type: "check_in", timestamp: 200 }])).toBe(true);
	});
});
