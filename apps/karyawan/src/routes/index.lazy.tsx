import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useYumiAuth } from "@yumipos/web-shared";

export const Route = createLazyFileRoute("/")({
  component: IndexRoute,
});

function IndexRoute() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useYumiAuth();

  useEffect(() => {
    if (isAuthenticated && user?.slug) {
      navigate({ to: "/$username" as any, params: { username: user.slug }, replace: true });
    } else {
      navigate({ to: "/login" as any, replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  return null;
}
