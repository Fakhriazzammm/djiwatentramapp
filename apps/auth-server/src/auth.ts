import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { dash } from "@better-auth/infra";

export const pool = new Pool({
  host: "localhost",
  port: 5433,
  user: "supabase_admin",
  password: process.env.DB_PASSWORD,
  database: "postgres",
});

export const auth = betterAuth({
  database: pool,
  baseURL: "https://djiwatentram.yumme.id",
  // Customer sessions are shared by the Djiwa App storefronts.
  trustedOrigins: [
    "https://djiwatentram.yumme.id",
    "https://investor.yumme.id",
    "https://merchandise.yumme.id",
    "https://booking.yumme.id",
    "https://b2b.yumme.id",
    "https://ordermieyamin.yumme.id",
    "https://500kopitasik.yumme.id",
    "https://djiwatravel.com",
    "https://www.djiwatravel.com",
    "https://kolmarketing.yumme.id",
    "https://rekrutmen.yumme.id",
    "http://localhost:5173",
    "http://localhost:3010",
  ],
  // Share the central customer session across Djiwa App subdomains.
  advanced: {
    cookies: {
      // Match the database OAuth verification entry's ten-minute TTL.
      state: { attributes: { maxAge: 600 } },
    },
    crossSubDomainCookies: {
      enabled: true,
      domain: ".yumme.id",
    },
    defaultCookieAttributes: {
      secure: true,
      httpOnly: true,
      sameSite: "lax",
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    dash(),
  ],
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  account: {
    accountLinking: {
      // ponytail: allow Google to link to existing email/password account
      enabled: true,
      trustedProviders: ["google"],
      allowDifferentEmails: false,
      // Akun email/password punya emailVerified=false; email Google sudah
      // terverifikasi, jadi izinkan link tanpa verifikasi email lokal dulu.
      requireLocalEmailVerified: false,
    },
  },
  // ponytail: add magic link/2FA when requested
});
