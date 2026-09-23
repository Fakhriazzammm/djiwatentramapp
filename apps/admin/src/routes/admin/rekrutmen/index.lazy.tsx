import { createLazyFileRoute } from "@tanstack/react-router";
import { RecruitmentPipelinePage } from "@/components/rekrutmen/pipeline-page";
export const Route = createLazyFileRoute("/admin/rekrutmen/")({ component: RecruitmentPipelinePage });
