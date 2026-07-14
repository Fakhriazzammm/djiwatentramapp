import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { dash } from "@better-auth/infra";

const pool = new Pool({
  host: "localhost",
  port: 5433,
  user: "supabase_admin",
  password: "supabase_local_password",
  database: "postgres",
});

export const auth = betterAuth({
  database: pool,
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
