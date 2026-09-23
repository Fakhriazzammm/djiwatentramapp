import { createLazyFileRoute } from "@tanstack/react-router";
import { PositionsPage } from "@/components/rekrutmen/route-pages";
export const Route = createLazyFileRoute("/admin/rekrutmen/positions")({ component: PositionsPage });
