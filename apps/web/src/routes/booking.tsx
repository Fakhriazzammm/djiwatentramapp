import { createFileRoute } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import { Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	CheckCircle,
	ChevronRight,
	CreditCard,
	Globe,
	Instagram,
	Minus,
	Phone,
	Plus,
	ShoppingBag,
	Trash2,
	X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { LoadingState } from "@/components/ui/loading-state";

export const Route = createFileRoute("/booking")({
	component: BookingPage,
});

// Simple Cart Interface
interface CartItem {
	productId: string;
	name: string;
	price: number;
	quantity: number;
	image?: string;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Component structure
function BookingPage() {
	const settings = useQuery(api.booking.getSettings, { slug: "booking" });
	const products = useQuery(api.booking.getBookingProducts, { slug: "booking" });
	const createOrder = useMutation(api.orders.createOrder);

	const [cart, setCart] = useState<CartItem[]>([]);
	const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
	const [customerInfo, setCustomerInfo] = useState({ name: "", phone: "" });
	const [paymentMethod, setPaymentMethod] = useState("qris"); // Default
	const [orderSuccess, setOrderSuccess] = useState<{
		orderId: string;
		orderNumber: string; // We don't have this from mutation directly unless we change backend, but we can simulate or fetch
		total: number;
	} | null>(null);

	// biome-ignore lint/suspicious/noExplicitAny: Product type is complex
	const addToCart = (product: any) => {
		setCart((prev) => {
			const existing = prev.find((item) => item.productId === product._id);
			if (existing) {
				return prev.map((item) =>
					item.productId === product._id
						? { ...item, quantity: item.quantity + 1 }
						: item
				);
			}
			return [
				...prev,
				{
					productId: product._id,
					name: product.name,
					price: product.price,
					quantity: 1,
					image: product.image,
				},
			];
		});
		toast.success(`${product.name} ditambahkan`);
	};

	const updateQuantity = (productId: string, delta: number) => {
		setCart((prev) =>
			prev
				.map((item) => {
					if (item.productId === productId) {
						return { ...item, quantity: Math.max(0, item.quantity + delta) };
					}
					return item;
				})
				.filter((item) => item.quantity > 0)
		);
	};

	const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
	const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

	const handleCheckout = async () => {
		if (!customerInfo.name || !customerInfo.phone) {
			toast.error("Mohon lengkapi nama dan nomor WhatsApp");
			return;
		}

		try {
			// Create order
			const orderId = await createOrder({
				items: cart.map((item) => ({
					productId: item.productId as Id<"products">,
					productName: item.name,
					quantity: item.quantity,
					price: item.price,
				})),
				totalAmount: cartTotal,
				paymentMethod: paymentMethod,
				customerName: `${customerInfo.name} (${customerInfo.phone})`,
                // source: "booking", // TODO: Add source to backend mutation args if not added yet
			});

			setOrderSuccess({
				orderId,
				orderNumber: `ORD-${Date.now().toString().slice(-4)}`, // Mock for now
				total: cartTotal,
			});
			setCart([]);
			setIsCheckoutOpen(false);
		} catch (error) {
			console.error(error);
			toast.error("Gagal membuat pesanan");
		}
	};

	if (!settings || !products) {
		return <LoadingState />;
	}

	if (settings.isActive === false) {
		return (
			<div className="flex h-screen items-center justify-center bg-gray-50 p-4">
				<div className="text-center">
					<h1 className="text-2xl font-bold text-gray-800">Halaman Tidak Aktif</h1>
					<p className="text-gray-500">Maaf, halaman pemesanan sedang tidak tersedia.</p>
				</div>
			</div>
		);
	}

    // Success View
	if (orderSuccess) {
		return (
			<div className="min-h-screen bg-gray-50 px-4 py-8 flex items-center justify-center">
				<div className="w-full max-w-md space-y-6 rounded-3xl bg-white p-8 shadow-xl text-center">
					<div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-600">
						<CheckCircle className="h-10 w-10" />
					</div>
					<div>
						<h2 className="text-2xl font-bold text-gray-900">Pesanan Berhasil!</h2>
						<p className="text-gray-500">Terima kasih telah memesan di {settings.title}</p>
					</div>

                    <div className="rounded-xl bg-gray-50 p-4 border border-gray-100">
                        <p className="text-sm text-gray-500">Total Pembayaran</p>
                        <p className="text-3xl font-bold text-primary">
                            Rp {orderSuccess.total.toLocaleString("id-ID")}
                        </p>
                    </div>

                    {/* Payment Instructions based on method */}
                    <div className="text-left space-y-4">
                        <h3 className="font-bold text-gray-800 border-b pb-2">Instruksi Pembayaran</h3>
                        
                        {paymentMethod === 'qris' && (
                             <div className="space-y-4 text-center">
                                {settings.paymentMethods?.includes('qris') ? (
                                    // Use configured QRIS or fallback
                                    // Note: settings.paymentPopupImage (from siteSettings) might be needed here if not in bookingSettings
                                    // For now, let's assume manual confirmation via WA
                                    <div className="bg-gray-100 p-4 rounded-lg">
                                        <p className="text-sm text-gray-600 mb-2">Silakan scan QRIS di kasir atau hubungi admin.</p>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500">Silakan hubungi admin untuk pembayaran QRIS.</p>
                                )}
                             </div>
                        )}

                        {paymentMethod === 'bank_transfer' && (
                             <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                <p className="font-medium text-blue-800 text-sm mb-1">Transfer ke:</p>
                                <p className="text-blue-900 font-mono whitespace-pre-wrap text-sm">{settings.bankDetails || "Hubungi Admin"}</p>
                             </div>
                        )}
                        
                        <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 text-sm text-yellow-800">
                            <p>Mohon konfirmasi pembayaran melalui WhatsApp dengan mengirimkan bukti transfer.</p>
                        </div>
                    </div>

					<a
						href={`https://wa.me/?text=Halo, saya sudah memesan dengan total Rp ${orderSuccess.total.toLocaleString("id-ID")}. Mohon diproses.`}
						target="_blank"
                        rel="noreferrer"
						className="block w-full rounded-xl bg-[#25D366] py-4 font-bold text-white shadow-lg transition-transform active:scale-95"
					>
						Konfirmasi via WhatsApp
					</a>
                    
                    <button 
                        type="button"
                        onClick={() => setOrderSuccess(null)}
                        className="text-sm text-gray-500 hover:text-gray-900 underline"
                    >
                        Kembali ke Halaman Utama
                    </button>
				</div>
			</div>
		);
	}

	// biome-ignore lint/suspicious/noExplicitAny: Dynamic CSS variables
	const style = { '--primary': settings.themeColor || '#000000' } as any;

	return (
		<div className="min-h-screen bg-gray-50 pb-32 font-sans" style={style}>
			{/* Banner */}
            {settings.bannerUrl ? (
                 <div className="h-48 w-full bg-gray-200">
                    {/* biome-ignore lint/correctness/useImageSize: Fluid layout */}
                    <img src={settings.bannerUrl} alt="Banner" className="h-full w-full object-cover" />
                 </div>
            ) : (
                <div className="h-32 w-full bg-gradient-to-r from-primary/80 to-primary" />
            )}

			<div className="mx-auto max-w-md px-4">
				{/* Profile Section */}
				<div className="relative -mt-16 mb-8 text-center">
					<div className="mx-auto h-32 w-32 overflow-hidden rounded-full border-4 border-white bg-white shadow-lg">
						{settings.logoUrl ? (
							// biome-ignore lint/correctness/useImageSize: Fluid layout
							<img src={settings.logoUrl} alt="Logo" className="h-full w-full object-cover" />
						) : (
							<div className="flex h-full w-full items-center justify-center bg-gray-100 text-3xl font-bold text-gray-400">
								{settings.title?.charAt(0) || "S"}
							</div>
						)}
					</div>
					<h1 className="mt-4 text-2xl font-bold text-gray-900">{settings.title}</h1>
					{settings.description && (
						<p className="mt-2 text-sm text-gray-600">{settings.description}</p>
					)}

                    {/* Social Links */}
                    {/* biome-ignore lint/suspicious/noExplicitAny: Dynamic links */}
                        {settings.socialLinks && settings.socialLinks.length > 0 && (
                            <div className="mt-4 flex flex-wrap justify-center gap-3">
                                {settings.socialLinks.map((link: any, idx: number) => (
                                    <a 
                                     key={link.url + idx} 
                                     href={link.url} 
                                    target="_blank"
                                    rel="noreferrer" 
                                    className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-hover hover:bg-gray-50 hover:shadow-md"
                                >
                                    {link.platform.toLowerCase().includes('instagram') ? <Instagram className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                                    {link.label}
                                </a>
                            ))}
                        </div>
                    )}
				</div>

				{/* Products Grid */}
				<div className="space-y-6">
					<h2 className="text-lg font-bold text-gray-900">Menu Pilihan</h2>
					<div className="grid gap-4">
						{products.map((product) => (
							<div
								key={product._id}
								className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm transition-all active:scale-[0.98]"
							>
								<div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
                                    {/* Using a placeholder or actual image if available in product schema */}
                                    {product.image ? (
                                        // biome-ignore lint/correctness/useImageSize: Fluid layout
                                        <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                                    ) : (
									    <ShoppingBag className="m-auto h-full w-8 text-gray-300" />
                                    )}
								</div>
								<div className="flex-1">
									<h3 className="font-bold text-gray-900">{product.name}</h3>
									<p className="text-sm text-gray-500 line-clamp-2">{product.description}</p>
									<p className="mt-1 font-bold text-primary">
										Rp {product.price.toLocaleString("id-ID")}
									</p>
								</div>
								<button
                                    type="button"
									onClick={() => addToCart(product)}
									className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-primary transition-colors hover:bg-primary hover:text-white"
								>
									<Plus className="h-5 w-5" />
								</button>
							</div>
						))}
                        {products.length === 0 && (
                            <p className="text-center text-gray-500 py-8">Belum ada produk yang ditampilkan.</p>
                        )}
					</div>
				</div>
			</div>

			{/* Floating Cart Button */}
			<AnimatePresence>
				{cartCount > 0 && (
					<motion.div
						initial={{ y: 100, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						exit={{ y: 100, opacity: 0 }}
						className="fixed bottom-6 left-0 right-0 z-40 px-4"
					>
						<button
                            type="button"
							onClick={() => setIsCheckoutOpen(true)}
							className="mx-auto flex w-full max-w-md items-center justify-between rounded-2xl bg-primary px-6 py-4 text-white shadow-xl shadow-primary/30 transition-transform active:scale-95"
						>
							<div className="flex items-center gap-3">
								<div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 font-bold">
									{cartCount}
								</div>
								<div className="flex flex-col items-start">
									<span className="text-xs font-medium opacity-90">Total</span>
									<span className="font-bold">Rp {cartTotal.toLocaleString("id-ID")}</span>
								</div>
							</div>
							<div className="flex items-center gap-2 font-bold">
								Checkout <ChevronRight className="h-5 w-5" />
							</div>
						</button>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Checkout Modal */}
			<AnimatePresence>
				{isCheckoutOpen && (
					<>
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							onClick={() => setIsCheckoutOpen(false)}
							className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
						/>
						<motion.div
							initial={{ y: "100%" }}
							animate={{ y: 0 }}
							exit={{ y: "100%" }}
							transition={{ type: "spring", damping: 25, stiffness: 300 }}
							className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-white p-6 shadow-2xl lg:mx-auto lg:max-w-md"
						>
							<div className="mb-6 flex items-center justify-between">
								<h2 className="text-xl font-bold text-gray-900">Checkout</h2>
								<button
                                    type="button"
									onClick={() => setIsCheckoutOpen(false)}
									className="rounded-full bg-gray-100 p-2 text-gray-500"
								>
									<X className="h-5 w-5" />
								</button>
							</div>

							<div className="max-h-[40vh] space-y-4 overflow-y-auto pr-2">
								{cart.map((item) => (
									<div key={item.productId} className="flex items-center justify-between">
										<div>
											<p className="font-bold text-gray-900">{item.name}</p>
											<p className="text-sm text-gray-500">
												Rp {item.price.toLocaleString("id-ID")} x {item.quantity}
											</p>
										</div>
										<div className="flex items-center gap-3">
											<button
                                                type="button"
												onClick={() => updateQuantity(item.productId, -1)}
												className="rounded-full border p-1 text-gray-500"
											>
												<Minus className="h-4 w-4" />
											</button>
											<span className="w-4 text-center font-bold">{item.quantity}</span>
											<button
                                                type="button"
												onClick={() => updateQuantity(item.productId, 1)}
												className="rounded-full border p-1 text-gray-500"
											>
												<Plus className="h-4 w-4" />
											</button>
										</div>
									</div>
								))}
							</div>

							<div className="mt-6 space-y-4 border-t pt-6">
								<div className="space-y-3">
									<label htmlFor="name-input" className="text-sm font-bold text-gray-700">Informasi Pemesan</label>
									<input
                                        id="name-input"
										placeholder="Nama Lengkap"
										className="w-full rounded-xl border-gray-200 bg-gray-50 p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20"
                                        value={customerInfo.name}
                                        onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})}
									/>
									<div className="relative">
                                        <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
										<input
                                            aria-label="Nomor WhatsApp"
											placeholder="Nomor WhatsApp (08...)"
											type="tel"
											className="w-full rounded-xl border-gray-200 bg-gray-50 p-3 pl-10 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20"
                                            value={customerInfo.phone}
                                            onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})}
										/>
									</div>
								</div>

                                <div className="space-y-3">
									<span className="text-sm font-bold text-gray-700">Metode Pembayaran</span>
									<div className="grid grid-cols-2 gap-3">
                                        {settings.paymentMethods?.includes('qris') && (
                                            <button 
                                                type="button"
                                                onClick={() => setPaymentMethod('qris')}
                                                className={`rounded-xl border p-3 text-sm font-medium transition-all ${paymentMethod === 'qris' ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-600'}`}
                                            >
                                                QRIS
                                            </button>
                                        )}
                                        {settings.paymentMethods?.includes('bank_transfer') && (
                                            <button 
                                                type="button"
                                                onClick={() => setPaymentMethod('bank_transfer')}
                                                className={`rounded-xl border p-3 text-sm font-medium transition-all ${paymentMethod === 'bank_transfer' ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-600'}`}
                                            >
                                                Transfer Bank
                                            </button>
                                        )}
                                        {(!settings.paymentMethods || settings.paymentMethods.length === 0) && (
                                             <button 
                                                type="button"
                                                onClick={() => setPaymentMethod('manual')}
                                                className={`rounded-xl border p-3 text-sm font-medium transition-all ${paymentMethod === 'manual' ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-600'}`}
                                            >
                                                Bayar di Kasir
                                            </button>
                                        )}
                                    </div>
                                </div>

								<div className="flex items-center justify-between border-t pt-4">
									<span className="font-bold text-gray-900">Total Bayar</span>
									<span className="text-2xl font-bold text-primary">
										Rp {cartTotal.toLocaleString("id-ID")}
									</span>
								</div>

								<button
                                    type="button"
                                    onClick={handleCheckout}
									className="w-full rounded-xl bg-primary py-4 font-bold text-white shadow-lg shadow-primary/20 transition-transform active:scale-[0.98]"
								>
									Pesan Sekarang
								</button>
							</div>
						</motion.div>
					</>
				)}
			</AnimatePresence>
		</div>
	);
}
