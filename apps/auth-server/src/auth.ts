import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { dash } from "@better-auth/infra";
import {
  customerAuthAdvancedConfig,
  customerAuthBaseUrl,
  resolveCustomerTrustedOrigins,
} from "./customer-auth-config.js";

export const pool = new Pool({
  host: "localhost",
  port: 5433,
  user: "supabase_admin",
  password: process.env.DB_PASSWORD,
  database: "postgres",
});

export const auth = betterAuth({
  database: pool,
  // Resolved per request from an allowlist so every storefront domain keeps a
  // first-party callback URL instead of one hardcoded origin.
  baseURL: customerAuthBaseUrl,
  // Customer sessions are shared by the Djiwa App storefronts.
  trustedOrigins: resolveCustomerTrustedOrigins(),
  // Share the central customer session across Djiwa App subdomains.
  advanced: customerAuthAdvancedConfig(),
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
