import { Outlet, createRootRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useYumiAuth, YumiAuthProvider } from "@yumipos/web-shared";
import { useEffect } from "react";

function RootContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading } = useYumiAuth();

  useEffect(() => {
    if (isLoading) return;

    const isPublicPage = location.pathname === "/login";

    if (!isAuthenticated) {
      if (!isPublicPage) {
        navigate({ to: "/login" as any, replace: true });
      }
    } else {
      if (location.pathname === "/login") {
        navigate({ to: "/" as any, replace: true });
      }
    }
  }, [isAuthenticated, isLoading, location.pathname, navigate]);

  return <Outlet />;
}

export const Route = createRootRoute({
  component: () => (
    <YumiAuthProvider>
      <RootContent />
    </YumiAuthProvider>
  ),
});
