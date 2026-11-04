import { assertEquals, assert } from "jsr:@std/assert@1";
import { buildTelegramMessage, formatFridayDate } from "./messages.ts";

Deno.test("donation_paid goes to the transaction group with prayer and real donor name", () => {
  const m = buildTelegramMessage({
    event_type: "donation_paid",
    payload: { donorName: "Azzam Tester", displayName: "Hamba Allah", showName: false, portions: 5, amount: 75000, prayer: "Semoga berkah", paidPortions: 55, target: 100, distributionDate: "2026-11-06" },
  })!;
  assertEquals(m.targets, ["transaction"]);
  assert(m.text.includes("Azzam Tester (tampil sebagai Hamba Allah)"));
  assert(m.text.includes("5 porsi"));
  assert(m.text.includes("Doa: \"Semoga berkah\""));
  assert(m.text.includes("55/100 porsi (55%)"));
  assert(m.text.includes("Jumat"));
});

Deno.test("closing recap tells the kitchen how many portions to cook", () => {
  const m = buildTelegramMessage({ event_type: "closing_recap", payload: { paidPortions: 80, donors: 21, target: 100, distributionDate: "2026-11-06" } })!;
  assertEquals(m.targets, ["kitchen", "transaction"]);
  assert(m.text.includes("MASAK 80 porsi"));
});

Deno.test("milestone 100 says quota is full and unknown events return null", () => {
  const m = buildTelegramMessage({ event_type: "milestone", payload: { percent: 100, paidPortions: 100, target: 100 } })!;
  assert(m.text.includes("Kuota penuh"));
  assertEquals(buildTelegramMessage({ event_type: "nope", payload: {} }), null);
});

Deno.test("formatFridayDate handles Jakarta date and bad input", () => {
  assert(formatFridayDate("2026-11-06").includes("Jumat"));
  assertEquals(formatFridayDate(""), "-");
});
