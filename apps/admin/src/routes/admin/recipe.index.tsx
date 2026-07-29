import { createFileRoute } from "@tanstack/react-router";
import { RecipeMatrixPage } from "@/components/admin/recipe-matrix";

export const Route = createFileRoute("/admin/recipe/")({
	component: RecipeMatrixPage,
});
