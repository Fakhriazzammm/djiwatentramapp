import { createFileRoute } from "@tanstack/react-router";
import { RecipeHppPage } from "@/components/admin/recipe-hpp";

export const Route = createFileRoute("/admin/recipe/hpp")({
	component: RecipeHppPage,
});
