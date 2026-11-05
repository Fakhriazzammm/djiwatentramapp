import { existsSync } from "node:fs";
export function assertBuildHost() {
  if (existsSync("/opt/supabase-selfhost/docker-compose.yml")) {
    throw new Error("Build diblokir pada VPS Supabase production. Build di CI/mesin terpisah lalu publish artifact.");
  }
}
