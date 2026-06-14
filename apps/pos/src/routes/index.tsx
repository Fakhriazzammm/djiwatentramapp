import { createFileRoute } from "@tanstack/react-router";

// Auth guard handled by __root.tsx — no unconditional redirect
export const Route = createFileRoute("/")({});
