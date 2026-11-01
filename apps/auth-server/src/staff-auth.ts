import { betterAuth } from "better-auth";
import { pool } from "./auth.js";

// Staff auth remains isolated from customer/KOL sessions by endpoint and cookie prefix.
export const staffAuth = betterAuth({
  database: pool,
  basePath: '/api/staff-auth',
  baseURL: "https://djiwatentram.web.id",
  trustedOrigins: [
    "https://karyawan.djiwatentram.web.id",
    "https://rekrutmen.djiwatentram.web.id",
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
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
});
