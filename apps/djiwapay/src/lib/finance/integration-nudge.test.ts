import { describe, expect, test } from "bun:test";
import { integrationNudgeActions } from "./integrations";

const google = { configured: true, features: { drive: false, gmail: false }, gmail: null };
const forwarding = { configured: true, source: null };
const script = { available: true, enabled: false, received: 0 };

describe("integration actions on Beranda", () => {
  test("suggests alternative email setup and requests only Drive for Google files", () => {
    expect(integrationNudgeActions(google, forwarding, script)).toEqual({
      email: true,
      googleFeatures: ["drive"],
    });
  });

  test("keeps alternative email setup available independently of Google OAuth", () => {
    expect(integrationNudgeActions(null, forwarding, script)).toEqual({
      email: true,
      googleFeatures: [],
    });
  });

  test("shows only the missing action when Apps Script already works", () => {
    expect(integrationNudgeActions(google, forwarding, { ...script, enabled: true, received: 1 })).toEqual({
      email: false,
      googleFeatures: ["drive"],
    });
  });

  test("keeps setup available after script creation until it receives an email", () => {
    const actions = integrationNudgeActions(google, forwarding, { ...script, enabled: true });
    expect(actions.email).toBe(true);
  });

  test("offers email alternatives again when direct Gmail reports an error", () => {
    expect(integrationNudgeActions(
      { ...google, features: { drive: true, gmail: true }, gmail: { enabled: true, error: "GMAIL_403" } },
      forwarding,
      script,
    )).toEqual({ email: true, googleFeatures: [] });
  });

  test("stops showing setup after active forwarding and Drive are connected", () => {
    expect(integrationNudgeActions(
      { ...google, features: { ...google.features, drive: true } },
      { ...forwarding, source: { enabled: true, forwarding: true } },
      script,
    )).toEqual({ email: false, googleFeatures: [] });
  });
});
