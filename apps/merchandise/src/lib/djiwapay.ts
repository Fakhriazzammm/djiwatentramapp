import { buildDjiwaPayUrl } from "@yumipos/djiwapay-core";

export function openDjiwaPay(username: string, route: "wallet" | "topup" = "wallet") {
  const returnTo = `${window.location.origin}/${encodeURIComponent(username)}`;
  window.location.assign(buildDjiwaPayUrl({ context: "merchandise", route, returnTo }));
}
