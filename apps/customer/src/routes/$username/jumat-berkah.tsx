import { createFileRoute } from "@tanstack/react-router";

type JumatBerkahSearch = { step?: "sedekah" | "selesai"; d?: string };

export const Route = createFileRoute("/$username/jumat-berkah")({
  validateSearch: (search: Record<string, unknown>): JumatBerkahSearch => ({
    step: search.step === "sedekah" || search.step === "selesai" ? search.step : undefined,
    d: typeof search.d === "string" && /^[A-Za-z0-9_]{6,80}$/.test(search.d) ? search.d : undefined,
  }),
});
