import { Outlet, createRootRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useYumiAuth, YumiAuthProvider, useDemoMode } from "@yumipos/web-shared";
import { Component, type ReactNode, useEffect, useState } from "react";
import { preloadFaceModels } from "@/components/auth/FaceRecognition";

// ── Error Boundary ──
class RootErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(error: unknown) {
    const message =
      error instanceof Error ? error.message :
      typeof error === "string" ? error :
      error && typeof (error as any).message === "string" ? (error as any).message :
      "Terjadi kesalahan yang tidak diketahui.";
    return { hasError: true, error: message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.054 0 1.927-.71 2.162-1.643.234-.932-.18-1.904-.993-2.387L13.33 4.643a2.258 2.258 0 00-2.66 0L3.965 14.97c-.813.483-1.227 1.455-.993 2.387.235.933 1.108 1.643 2.162 1.643z" /></svg>
          </div>
          <h2 className="text-base font-bold text-foreground">Terjadi Kesalahan</h2>
          <p className="text-xs text-muted-foreground max-w-xs">{this.state.error}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white"
          >
            Muat Ulang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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

  // Preload face models in background for faster attendance
  useEffect(() => {
    preloadFaceModels();
  }, []);

  // Demo mode — client viewer: mask all numbers
  useDemoMode();

  return <Outlet />;
}

export const Route = createRootRoute({
  component: () => (
    <YumiAuthProvider>
      <RootErrorBoundary>
        <RootContent />
      </RootErrorBoundary>
    </YumiAuthProvider>
  ),
});
