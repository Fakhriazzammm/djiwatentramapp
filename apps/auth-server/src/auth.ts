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

// Shared by the isolated staff auth configuration.
export const authBaseURL = process.env.BETTER_AUTH_URL || "https://auth.zantara.id";

export const auth = betterAuth({
  database: pool,
  // The reverse proxy must overwrite forwarded headers with the public host.
  // Keep OAuth callbacks on the host that issued the state cookie.
  baseURL: {
    allowedHosts: ["auth.zantara.id", "api.yumme.id", "djiwatentram.yumme.id"],
    fallback: process.env.BETTER_AUTH_URL || "https://auth.zantara.id",
    protocol: "https",
  },
  // Customer sessions are shared by the Djiwa App storefronts.
  trustedOrigins: [
    "https://djiwatentram.yumme.id",
    "https://investor.yumme.id",
    "https://merchandise.yumme.id",
    "https://booking.yumme.id",
    "https://b2b.yumme.id",
    "https://ordermieyamin.yumme.id",
    "https://500kopitasik.yumme.id",
    "https://kolmarketing.yumme.id",
    "https://rekrutmen.yumme.id",
    "http://localhost:5173",
    "http://localhost:3010",
  ],
  // Share the central customer session across Djiwa App subdomains.
  advanced: {
    trustedProxyHeaders: true,
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
