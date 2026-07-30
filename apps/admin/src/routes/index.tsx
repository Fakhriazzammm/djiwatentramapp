import { createFileRoute, redirect } from "@tanstack/react-router";

// Landing page is the admin login — redirect to it directly.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/login" as any, replace: true });
  },
});
 
