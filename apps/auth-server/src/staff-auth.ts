import { betterAuth } from "better-auth";
import { pool } from "./auth.js";

// Staff auth remains isolated from customer/KOL sessions by endpoint and cookie prefix.
export const staffAuth = betterAuth({
  database: pool,
  baseURL: "https://djiwatentram.yumme.id",
  trustedOrigins: [
    "https://karyawan.yumme.id",
    "http://localhost:5173",
    "http://localhost:5174",
  ],
  advanced: {
    cookiePrefix: "djiwa_staff",
    defaultCookieAttributes: {
      secure: true,
      httpOnly: true,
      sameSite: "lax",
    },
  },
  emailAndPassword: { enabled: true },
});
