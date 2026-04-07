import { createFileRoute } from "@tanstack/react-router";
import { RecipeStudioPage } from "@/components/admin/recipe-book";

export const Route = createFileRoute("/admin/recipe/")({
	component: RecipeStudioPage,
});
