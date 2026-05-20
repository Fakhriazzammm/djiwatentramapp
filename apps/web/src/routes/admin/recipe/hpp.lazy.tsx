import { createLazyFileRoute } from "@tanstack/react-router";
import { RecipeHppPage } from "@/components/admin/recipe-hpp";

export const Route = createLazyFileRoute("/admin/recipe/hpp")({
	component: RecipeHppPage,
});
