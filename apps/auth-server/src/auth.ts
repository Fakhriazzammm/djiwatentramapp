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
  accountLinking: {
    // ponytail: allow Google to link to existing email/password account
    enabled: true,
    allowDifferentEmails: false,
    allowUnlink: true,
  },
  // ponytail: add magic link/2FA when requested
});
