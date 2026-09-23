import { createLazyFileRoute } from "@tanstack/react-router";
import { InterviewsPage } from "@/components/rekrutmen/route-pages";
export const Route = createLazyFileRoute("/admin/rekrutmen/interviews")({ component: InterviewsPage });
