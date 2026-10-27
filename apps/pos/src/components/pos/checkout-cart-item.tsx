import { useEffect, useState } from "react";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import type { CartItem } from "@/context/cart-context";
import { resolvePosAssetUrl } from "@/lib/asset-url";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CheckoutCartItemProps = {
	item: CartItem;
	onQuantityChange: (delta: number) => void;
	onPriceChange: (price: number) => void;
	showPlatformPrice?: boolean;
};

export function CheckoutCartItem({
	item,
	onQuantityChange,
	onPriceChange,
	showPlatformPrice = false,
}: CheckoutCartItemProps) {
	const imageSrc = resolvePosAssetUrl(item.image);
	const [imageFailed, setImageFailed] = useState(!imageSrc);

	useEffect(() => {
		setImageFailed(!imageSrc);
	}, [imageSrc]);

	return (
		<article className="flex items-center gap-2 rounded-lg border border-border/70 bg-card p-2 shadow-sm">
			<div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-muted/60">
				{imageSrc && !imageFailed ? (
					<img
						src={imageSrc}
						alt={item.name}
						className="h-full w-full object-cover"
						loading="lazy"
						decoding="async"
						onError={() => setImageFailed(true)}
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center text-muted-foreground/45">
						<ShoppingBag className="h-5 w-5" aria-hidden="true" />
					</div>
				)}
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<p className="truncate text-xs font-bold text-foreground">{item.name}</p>
						{item.variant && (
							<p className="truncate text-[10px] text-muted-foreground">{item.variant}</p>
						)}
					</div>
					<span className="shrink-0 text-xs font-semibold">Rp{(item.price * item.quantity).toLocaleString("id-ID")}</span>
				</div>
				<div className="mt-1 flex items-center justify-between gap-2">
					{showPlatformPrice ? (
						<label className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
							<span className="shrink-0">Harga</span>
							<Input
								type="number"
								inputMode="numeric"
								min="0"
								className="h-7 w-24 px-1.5 text-xs"
								value={item.platformPrice ?? item.price}
								onChange={(event) => {
									const price = Number(event.target.value);
									if (Number.isFinite(price) && price >= 0) onPriceChange(price);
								}}
							/>
						</label>
					) : (
						<span className="text-[10px] text-muted-foreground">{item.quantity} porsi</span>
					)}
					<div className="flex items-center gap-1">
						<Button
							type="button"
							aria-label={`Kurangi ${item.name}${item.variant ? ` ${item.variant}` : ""}`}
							className={cn("h-7 w-7 rounded-md p-0", "shadow-none")}
							variant="outline"
							onClick={() => onQuantityChange(-1)}
						>
							<Minus className="h-3 w-3" />
						</Button>
						<span className="min-w-5 text-center text-xs font-semibold" aria-label="Jumlah">
							{item.quantity}
						</span>
						<Button
							type="button"
							aria-label={`Tambah ${item.name}${item.variant ? ` ${item.variant}` : ""}`}
							className="h-7 w-7 rounded-md p-0 shadow-none"
							variant="outline"
							onClick={() => onQuantityChange(1)}
						>
							<Plus className="h-3 w-3" />
						</Button>
					</div>
				</div>
			</div>
		</article>
	);
}
