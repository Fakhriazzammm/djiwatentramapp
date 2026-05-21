import { createFileRoute } from "@tanstack/react-router";

export function BaseRecipeManagerPage() {
  return <div className="p-8 text-center text-muted-foreground">Base Recipe — Akan dibuat di fase selanjutnya.</div>;
}

export const Route = createFileRoute("/admin/recipe/base")({ component: BaseRecipeManagerPage });
