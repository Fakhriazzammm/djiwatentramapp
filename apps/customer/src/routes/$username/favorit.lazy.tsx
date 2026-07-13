import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createLazyFileRoute("/$username/favorit")({
  component: FavoritPage,
});

function FavoritPage() {
  const { username } = Route.useParams();
  const navigate = useNavigate();

  return (
    <div className="app-page min-h-app">
      <div className="app-shell mx-auto min-h-app max-w-md bg-background">
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate({ to: "/$username", params: { username } })} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Kembali
            </button>
          </div>
        </header>
        <main className="flex flex-col items-center justify-center px-3 py-20 text-center">
          <span className="text-4xl">⭐</span>
          <h1 className="mt-3 text-base font-black">Menu Favorit</h1>
          <p className="mt-1 text-xs text-muted-foreground">Fitur ini sedang dalam pengembangan. Nantikan update terbaru!</p>
        </main>
      </div>
    </div>
  );
}
