import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useYumiAuth } from "@yumipos/web-shared";

export const Route = createLazyFileRoute("/")({
  component: IndexRoute,
});

function IndexRoute() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, user } = useYumiAuth();

  useEffect(() => {
    // Jangan ambil keputusan sebelum sesi selesai diverifikasi.
    if (isLoading) return;

    if (!isAuthenticated) {
      navigate({ to: "/login" as any, replace: true });
      return;
    }

    // slug bisa kosong untuk sebagian user; _id selalu ada dan route /$username
    // menerima keduanya. Tanpa fallback ini alurnya memantul "/" ↔ "/login":
    // index melempar ke /login karena slug kosong, root guard melihat user
    // sudah login lalu melempar balik ke "/".
    const handle = user?.slug || user?._id;
    if (!handle) return;

    navigate({
      to: "/$username",
      params: { username: handle },
      replace: true,
    } as any);
  }, [isAuthenticated, isLoading, user, navigate]);

  return null;
}
