import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createLazyFileRoute("/$username/poin")({ component: LegacyPoinRedirect });

function LegacyPoinRedirect() {
  const { username } = Route.useParams();
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/$username/saldo", params: { username }, replace: true });
  }, [navigate, username]);
  return null;
}
