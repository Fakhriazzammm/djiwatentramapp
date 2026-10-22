import type { DjiwaPayContext } from "@yumipos/djiwapay-core";
import { buildDjiwaPayUrl } from "@yumipos/djiwapay-core";
export function DjiwaPayLaunchCard({ context, returnTo }: { context: DjiwaPayContext; returnTo?: string }) {
  const href = buildDjiwaPayUrl({ context, returnTo });
  return <a href={href} className="djiwapay-launch-card" data-djiwapay-context={context}><strong>Djiwa Pay</strong><span>Buka wallet dan pembayaran</span></a>;
}
