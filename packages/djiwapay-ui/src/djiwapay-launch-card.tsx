import type { DjiwaPayContext } from "@djiwaapps/djiwapay-core";
import { buildDjiwaPayUrl } from "@djiwaapps/djiwapay-core";
export function DjiwaPayLaunchCard({ context, returnTo }: { context: DjiwaPayContext; returnTo?: string }) {
  const href = buildDjiwaPayUrl({ context, returnTo });
  return <a href={href} className="djiwapay-launch-card" data-djiwapay-context={context}><strong>Djiwa Pay</strong><span>Buka wallet dan pembayaran</span></a>;
}
