import { createLazyFileRoute } from "@tanstack/react-router";
import CommandCenter from "./-dashboard/CommandCenter";

// Pusat Pantau Operasional (command center). Dashboard lama sudah dihapus.
export const Route = createLazyFileRoute("/admin/")({
	component: CommandCenter,
});
