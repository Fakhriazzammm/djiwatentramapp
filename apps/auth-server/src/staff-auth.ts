import { betterAuth } from "better-auth";
import { pool } from "./auth.js";

// Staff auth remains isolated from customer/KOL sessions by endpoint and cookie prefix.
export const staffAuth = betterAuth({
  database: pool,
  basePath: '/api/staff-auth',
  baseURL: process.env.CUSTOMER_APP_URL,
  trustedOrigins: (process.env.STAFF_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean),
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
