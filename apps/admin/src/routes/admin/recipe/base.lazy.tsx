import { createLazyFileRoute } from "@tanstack/react-router";
import { BaseRecipeManagerPage } from "./base";
// Sementara pakai yang sama — nanti ganti ke component admin yang sebenarnya
export const Route = createLazyFileRoute("/admin/recipe/base")({ component: BaseRecipeManagerPage });
