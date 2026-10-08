import { createLazyFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createLazyFileRoute("/$username/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const navigate = useNavigate();
  const { username } = useParams({ from: "/$username/" as any }) as { username: string };

  useEffect(() => {
    navigate({ to: "/$username/beranda", params: { username }, replace: true });
  }, [navigate, username]);

  return null;
}
