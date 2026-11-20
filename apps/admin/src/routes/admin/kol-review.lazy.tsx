import { createLazyFileRoute } from "@tanstack/react-router";
import { KolReviewPage } from "./-kol/kol-review";

export const Route = createLazyFileRoute("/admin/kol-review")({ component: KolReviewPage });
