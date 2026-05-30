import { Outlet, createRootRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useYumiAuth, YumiAuthProvider } from "@yumipos/web-shared";
import { useEffect, useState } from "react";

function RootContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading } = useYumiAuth();
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    const path = location.pathname;

    // Public pages: /login and /$username (any single-segment path like /selinaapriliani)
    const isLoginPage = path === "/login";
    const isProfilePage = path !== "/login" && path !== "/" && path.startsWith("/");
    const isPublicPage = isLoginPage || isProfilePage;

    if (!isAuthenticated) {
      if (!isPublicPage) {
        navigate({ to: "/login" as any, replace: true });
      }
    } else {
      if (isLoginPage) {
        // After login, redirect to user's own profile page
        navigate({ to: "/" as any, replace: true });
      }
    }
    setInitialCheckDone(true);
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
