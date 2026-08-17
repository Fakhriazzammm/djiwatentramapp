import { createAuthClient } from "better-auth/react";
import { sentinelClient } from "@better-auth/infra/client";

export const authClient = createAuthClient({
  baseURL: "https://djiwatentram.yumme.id/api/auth",
  plugins: [
    sentinelClient(),
  ],
});
