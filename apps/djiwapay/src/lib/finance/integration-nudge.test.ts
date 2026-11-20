import { expect, test } from "bun:test";
import { missingGoogleFeatures } from "./integrations";

const disconnected = { configured: true, features: { drive: false, gmail: false, calendar: false }, gmail: null };

test("one connection asks for Calendar, Drive/Sheets and read-only Gmail", () => {
  expect(missingGoogleFeatures(disconnected)).toEqual(["drive", "gmail", "calendar"]);
});

test("a partial grant offers only the missing feature", () => {
  expect(missingGoogleFeatures({
    ...disconnected, features: { drive: true, gmail: false, calendar: true },
  })).toEqual(["gmail"]);
});

test("Gmail can be re-enabled after it was turned off", () => {
  const features = { drive: true, gmail: true, calendar: true };
  expect(missingGoogleFeatures({ configured: true, features, gmail: null })).toEqual(["gmail"]);
  expect(missingGoogleFeatures({ configured: true, features, gmail: { enabled: true } })).toEqual([]);
});

test("an unavailable OAuth setup has no connect action", () => {
  expect(missingGoogleFeatures({ ...disconnected, configured: false })).toEqual([]);
  expect(missingGoogleFeatures(null)).toEqual([]);
});
