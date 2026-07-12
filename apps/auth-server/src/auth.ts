import { betterAuth } from "better-auth";
import { Pool } from "pg";

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
  // ponytail: no social providers, no magic link, no 2FA — add when requested
});
