"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { useHybridAddProduct } from "@/hooks/use-hybrid-write-actions";
import { useHybridCategories } from "@/hooks/use-hybrid-pos-data";

type QuickProductFormProps = {
	open: boolean;
	onClose: () => void;
	onSuccess: (productId: string) => void;
};

export default function QuickProductForm({
	open,
	onClose,
	onSuccess,
}: QuickProductFormProps) {
	const addProduct = useHybridAddProduct();
	const categories = useHybridCategories();

	const [name, setName] = useState("");
	const [price, setPrice] = useState("");
	const [categoryId, setCategoryId] = useState("");
	const [description, setDescription] = useState("");
	const [menuNumber, setMenuNumber] = useState("");
	const [isAvailable, setIsAvailable] = useState(true);
	const [quantity, setQuantity] = useState("");
	const [isAlaCarte, setIsAlaCarte] = useState(false);
	const [loading, setLoading] = useState(false);

	// Reset form every time dialog opens
	useEffect(() => {
		if (open) {
			setName("");
			setPrice("");
			setCategoryId("");
			setDescription("");
			setMenuNumber("");
			setIsAvailable(true);
			setQuantity("");
			setIsAlaCarte(false);
			setLoading(false);
		}
	}, [open]);

	const handleSubmit = async () => {
		if (!name.trim()) {
			toast.error("Nama produk wajib diisi");
			return;
		}
		if (!price || Number(price) <= 0) {
			toast.error("Harga jual wajib diisi dan harus lebih dari 0");
			return;
		}

		setLoading(true);
		try {
			const sourceId = await addProduct({
				name: name.trim(),
				price: Number(price),
				categoryId: categoryId || undefined,
				description: description.trim() || undefined,
				menuNumber: menuNumber ? Number(menuNumber) : undefined,
				isAvailable,
				quantity: quantity ? Number(quantity) : undefined,
				isAlaCarte,
			});
			toast.success("Produk berhasil ditambahkan");
			onSuccess(sourceId);
			onClose();
		} catch (error: any) {
			toast.error(error?.message || "Gagal menambahkan produk");
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen: boolean) => {
				if (!nextOpen) onClose();
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Tambah Produk Baru</DialogTitle>
				</DialogHeader>

				<div className="grid gap-3 py-2">
					{/* Nama */}
					<div className="grid gap-1.5">
						<Label className="text-[11px]">Nama Produk</Label>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Nama produk"
						/>
					</div>

					{/* Harga */}
					<div className="grid gap-1.5">
						<Label className="text-[11px]">Harga Jual</Label>
						<Input
							type="number"
							value={price}
							onChange={(e) => setPrice(e.target.value)}
							placeholder="0"
							min={0}
						/>
					</div>

					{/* Kategori */}
					<div className="grid gap-1.5">
						<Label className="text-[11px]">Kategori</Label>
						<select
							value={categoryId}
							onChange={(e) => setCategoryId(e.target.value)}
							className="flex h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3.5 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
						>
							<option value="">— Pilih Kategori —</option>
							{(categories ?? []).map((cat: any) => (
								<option key={cat._id} value={cat._id}>
									{cat.name}
								</option>
							))}
						</select>
					</div>

					{/* Deskripsi */}
					<div className="grid gap-1.5">
						<Label className="text-[11px]">
							Deskripsi <span className="text-muted-foreground">(opsional)</span>
						</Label>
						<Textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Deskripsi produk"
							rows={2}
						/>
					</div>

					{/* Nomor Menu */}
					<div className="grid gap-1.5">
						<Label className="text-[11px]">
							Nomor Menu{" "}
							<span className="text-muted-foreground">(opsional)</span>
						</Label>
						<Input
							type="number"
							value={menuNumber}
							onChange={(e) => setMenuNumber(e.target.value)}
							placeholder="0"
							min={0}
						/>
					</div>

					{/* Stok */}
					<div className="grid gap-1.5">
						<Label className="text-[11px]">
							Stok <span className="text-muted-foreground">(opsional)</span>
						</Label>
						<Input
							type="number"
							value={quantity}
							onChange={(e) => setQuantity(e.target.value)}
							placeholder="0"
							min={0}
						/>
					</div>

					{/* Checkboxes */}
					<div className="flex items-center gap-6">
						<label className="flex cursor-pointer items-center gap-2">
							<Checkbox
								checked={isAvailable}
								onCheckedChange={(checked: boolean) =>
									setIsAvailable(checked)
								}
							/>
							<span className="text-[11px]">Tersedia</span>
						</label>
						<label className="flex cursor-pointer items-center gap-2">
							<Checkbox
								checked={isAlaCarte}
								onCheckedChange={(checked: boolean) =>
									setIsAlaCarte(checked)
								}
							/>
							<span className="text-[11px]">Ala Carte</span>
						</label>
					</div>
				</div>

				<DialogFooter className="flex gap-2 pt-2">
					<Button
						variant="outline"
						onClick={onClose}
						disabled={loading}
					>
						Batal
					</Button>
					<Button onClick={handleSubmit} loading={loading}>
						{loading ? "Menyimpan…" : "Simpan"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
