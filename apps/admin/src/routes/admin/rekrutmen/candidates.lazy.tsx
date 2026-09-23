import { createLazyFileRoute } from "@tanstack/react-router";
import { CandidatesPage } from "@/components/rekrutmen/route-pages";
export const Route = createLazyFileRoute("/admin/rekrutmen/candidates")({ component: CandidatesPage });
