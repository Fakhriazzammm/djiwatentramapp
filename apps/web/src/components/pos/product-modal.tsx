import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, ShoppingCart, X } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/ui/icon";
import { useCart } from "@/context/cart-context";

interface Product {
	_id: string;
	name: string;
	price: number;
	image?: string;
	description?: string;
}

export function ProductModal({
	product,
	isOpen,
	onClose,
}: {
	product: Product;
	isOpen: boolean;
	onClose: () => void;
}) {
	const [quantity, setQuantity] = useState(1);
	const [variant, setVariant] = useState({ size: "Regular", temp: "Iced" });
	const { addToCart } = useCart();

	const handleAddToCart = () => {
		addToCart({
			productId: product._id,
			name: product.name,
			price: product.price,
			quantity,
			image: product.image,
			variant: `${variant.size}, ${variant.temp}`,
		});
		setQuantity(1);
		onClose();
	};

	const decreaseQuantity = () => setQuantity(Math.max(1, quantity - 1));
	const increaseQuantity = () => setQuantity(quantity + 1);

	const updateSize = (size: string) => setVariant({ ...variant, size });
	const updateTemp = (temp: string) => setVariant({ ...variant, temp });

	return (
		<AnimatePresence>
			{isOpen && product && (
				<>
					{/* Backdrop */}
					<motion.div
						animate={{ opacity: 1 }}
						className="fixed inset-0 z-40 bg-black/40 backdrop-blur-md"
						exit={{ opacity: 0 }}
						initial={{ opacity: 0 }}
						onClick={onClose}
					/>

					{/* Modal */}
					<motion.div
						animate={{ opacity: 1, scale: 1, y: 0 }}
						aria-labelledby="product-modal-title"
						aria-modal="true"
						className="fixed inset-0 z-50 m-auto flex h-fit max-h-[90vh] w-[90%] max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
						exit={{ opacity: 0, scale: 0.9, y: 20 }}
						initial={{ opacity: 0, scale: 0.9, y: 20 }}
						role="dialog"
					>
						{/* Close Button */}
						<div className="relative h-64 bg-muted">
							{product.image ? (
								<img
									alt={product.name}
									className="h-full w-full object-cover"
									height={300}
									src={product.image}
									width={500}
								/>
							) : (
								<div className="flex h-full w-full items-center justify-center font-bold text-[10px] text-muted-foreground/40 uppercase tracking-widest">
									No Image
								</div>
							)}
							<IconButton
								aria-label="Tutup detail produk"
								className="absolute top-4 right-4"
								onClick={onClose}
								size="sm"
								variant="ghost"
							>
								<X className="h-6 w-6" />
							</IconButton>
						</div>

						<div className="flex flex-1 flex-col p-8">
							<div className="flex-1">
								<h2
									className="mb-1 font-bold text-2xl text-foreground tracking-tight"
									id="product-modal-title"
								>
									{product.name}
								</h2>
								<p className="mb-4 font-bold text-foreground text-xl">
									{new Intl.NumberFormat("id-ID", {
										style: "currency",
										currency: "IDR",
										maximumFractionDigits: 0,
									}).format(product.price)}
								</p>
								<p className="mb-6 text-muted-foreground text-sm leading-relaxed">
									{product.description || "Tidak ada deskripsi tersedia."}
								</p>

								{/* Variant Selection */}
								<div className="space-y-6">
									<fieldset className="space-y-3">
										<legend className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
											Pilih Ukuran
										</legend>
										<div className="flex gap-3">
											{["Regular", "Large"].map((size) => (
												<button
													aria-label={`Ukuran ${size}`}
													aria-pressed={variant.size === size}
													className={`flex-1 rounded-lg border-2 py-3 font-medium text-sm transition-all ${
														variant.size === size
															? "border-primary bg-primary text-primary-foreground"
															: "border-border bg-background text-muted-foreground hover:border-primary/50"
													}`}
													key={size}
													onClick={() => updateSize(size)}
													type="button"
												>
													{size}
												</button>
											))}
										</div>
									</fieldset>

									<fieldset className="space-y-3">
										<legend className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
											Pilihan Suhu
										</legend>
										<div className="flex gap-3">
											{["Hot", "Iced"].map((temp) => (
												<button
													aria-label={`Suhu ${temp}`}
													aria-pressed={variant.temp === temp}
													className={`flex-1 rounded-lg border-2 py-3 font-medium text-sm transition-all ${
														variant.temp === temp
															? "border-primary bg-primary text-primary-foreground"
															: "border-border bg-background text-muted-foreground hover:border-primary/50"
													}`}
													key={temp}
													onClick={() => updateTemp(temp)}
													type="button"
												>
													{temp}
												</button>
											))}
										</div>
									</fieldset>
								</div>
							</div>

							<div className="mt-8 flex items-center gap-4">
								{/* Quantity Control */}
								<fieldset
									aria-label="Jumlah item"
									className="flex items-center gap-4 rounded-lg bg-muted p-2 px-4"
								>
									<IconButton
										aria-label="Kurangi jumlah"
										className="rounded-md bg-card p-3 shadow-sm"
										onClick={decreaseQuantity}
										size="lg"
									>
										<Minus className="h-5 w-5 text-foreground" />
									</IconButton>
									<output
										aria-live="polite"
										className="w-8 text-center font-bold text-foreground text-xl"
									>
										{quantity}
									</output>
									<IconButton
										aria-label="Tambah jumlah"
										className="rounded-md bg-card p-3 shadow-sm"
										onClick={increaseQuantity}
										size="lg"
									>
										<Plus className="h-5 w-5 text-foreground" />
									</IconButton>
								</fieldset>

								<button
									className="flex flex-1 items-center justify-center gap-3 rounded-lg bg-primary py-5 font-semibold text-primary-foreground text-sm shadow-lg transition-all hover:bg-primary/90 active:scale-[0.98]"
									onClick={handleAddToCart}
									type="button"
								>
									<ShoppingCart className="h-4 w-4" /> Tambah —{" "}
									{new Intl.NumberFormat("id-ID", {
										style: "currency",
										currency: "IDR",
										maximumFractionDigits: 0,
									}).format(product.price * quantity)}
								</button>
							</div>
						</div>
					</motion.div>
				</>
			)}
		</AnimatePresence>
	);
}
