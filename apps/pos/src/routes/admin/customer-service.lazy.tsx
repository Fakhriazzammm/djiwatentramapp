import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import type { Id } from "@/types/backend-compat";
import {
	Bell,
	CheckCircle2,
	ChefHat,
	Clock3,
	Search,
	UserRound,
	XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useHybridCustomerServiceRequests } from "@/hooks/use-hybrid-finance-analytics-data";
import { useHybridUpdateCustomerServiceStatus } from "@/hooks/use-hybrid-write-actions";
import { triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";

export const Route = createLazyFileRoute("/admin/customer-service")({
	component: CustomerServiceRequestsPage,
});

type RequestStatus = "all" | "pending" | "acknowledged" | "completed" | "cancelled";

function CustomerServiceRequestsPage() {
	const navigate = useNavigate();
	const [statusFilter, setStatusFilter] = useState<RequestStatus>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const requests = useHybridCustomerServiceRequests(
		statusFilter === "all" ? { limit: 200 } : { status: statusFilter, limit: 200 }
	);
	const updateStatus = useHybridUpdateCustomerServiceStatus();

	const filteredRequests = useMemo(() => {
		if (!requests) return undefined;
		const q = searchQuery.trim().toLowerCase();
		if (!q) return requests;
		return requests.filter((request: any) =>
			[
				request.orderNumber,
				request.tableNumber,
				request.customerName,
				request.brandSlug,
				request.notes,
			]
				.filter(Boolean)
				.some((value) => String(value).toLowerCase().includes(q))
		);
	}, [requests, searchQuery]);

	const counts = useMemo(() => {
		if (!requests) return { pending: 0, acknowledged: 0, completed: 0 };
		return {
			pending: requests.filter((item: any) => item.status === "pending").length,
			acknowledged: requests.filter((item: any) => item.status === "acknowledged").length,
			completed: requests.filter((item: any) => item.status === "completed").length,
		};
	}, [requests]);

	const handleUpdateStatus = async (
		id: Id<"customerServiceRequests">,
		status: Exclude<RequestStatus, "all">
	) => {
		try {
			await updateStatus({ id, status });
			toast.success("Status request berhasil diperbarui"); triggerHybridRefresh();
		} catch (error) {
			toast.error((error as Error).message || "Gagal memperbarui request");
		}
	};

	if (filteredRequests === undefined) {
		return (
			<div className="space-y-4">
				<div className="grid grid-cols-3 gap-3">
					{Array.from({ length: 3 }).map((_, index) => (
						<Skeleton className="h-24 rounded-2xl" key={index} />
					))}
				</div>
				{Array.from({ length: 4 }).map((_, index) => (
					<Skeleton className="h-36 rounded-2xl" key={index} />
				))}
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
				<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
					<div>
						<h2 className="font-bold text-xl tracking-tight">Layanan Customer</h2>
						<p className="text-sm text-muted-foreground">
							Pantau panggilan staff dan permintaan dessert dari halaman customer.
						</p>
					</div>
					<div className="grid grid-cols-3 gap-2 md:w-[360px]">
						<SummaryCard icon={<Bell className="h-4 w-4" />} label="Pending" value={counts.pending} />
						<SummaryCard icon={<Clock3 className="h-4 w-4" />} label="Diproses" value={counts.acknowledged} />
						<SummaryCard icon={<CheckCircle2 className="h-4 w-4" />} label="Selesai" value={counts.completed} />
					</div>
				</div>
			</div>

			<div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
				<div className="flex flex-col gap-3 md:flex-row md:items-center">
					<div className="relative flex-1">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							className="pl-9"
							placeholder="Cari meja, order, customer..."
							value={searchQuery}
							onChange={(event) => setSearchQuery(event.target.value)}
						/>
					</div>
					<div className="flex flex-wrap gap-2">
						{(["all", "pending", "acknowledged", "completed", "cancelled"] as const).map((status) => (
							<Button
								className="rounded-full"
								key={status}
								onClick={() => setStatusFilter(status)}
								size="sm"
								variant={statusFilter === status ? "default" : "outline"}
							>
								{getStatusLabel(status)}
							</Button>
						))}
					</div>
				</div>
			</div>

			<div className="space-y-3">
				{filteredRequests.length === 0 ? (
					<div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
						Belum ada request layanan customer.
					</div>
				) : (
					filteredRequests.map((request: any) => (
						<div
							className="rounded-3xl border border-border bg-card p-4 shadow-sm"
							key={request._id}
						>
							<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
								<div className="space-y-3">
									<div className="flex flex-wrap items-center gap-2">
										<Badge className={getRequestTypeClassName(request.requestType)} variant="outline">
											{getRequestTypeLabel(request.requestType)}
										</Badge>
										<Badge className={getStatusClassName(request.status)} variant="outline">
											{getStatusLabel(request.status)}
										</Badge>
										<span className="text-xs text-muted-foreground">
											{new Date(request.createdAt).toLocaleString("id-ID")}
										</span>
									</div>
									<div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
										<div className="flex items-center gap-2">
											<UserRound className="h-4 w-4 text-primary" />
											<span>{request.customerName || "Customer umum"}</span>
										</div>
										<div className="flex items-center gap-2">
											<ChefHat className="h-4 w-4 text-primary" />
											<span>Meja {request.tableNumber || "-"}</span>
										</div>
									</div>
									<div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
										<span>Brand: {request.brandSlug}</span>
										{request.orderNumber ? <span>Order: {request.orderNumber}</span> : null}
									</div>
									{request.notes ? (
										<div className="rounded-2xl bg-muted/40 px-3 py-2 text-sm text-foreground">
											{request.notes}
										</div>
									) : null}
								</div>

								<div className="flex flex-wrap gap-2 md:max-w-[260px] md:justify-end">
									{request.orderNumber ? (
										<Button
											onClick={() =>
												navigate({
													to: "/admin/orders",
													search: { focusOrder: request.orderNumber } as any,
												})
											}
											size="sm"
											variant="outline"
										>
											Lihat Order
										</Button>
									) : null}
									<Button
										onClick={() => handleUpdateStatus(request._id, "acknowledged")}
										size="sm"
										variant="outline"
										disabled={request.status === "acknowledged"}
									>
										Proses
									</Button>
									<Button
										onClick={() => handleUpdateStatus(request._id, "completed")}
										size="sm"
										disabled={request.status === "completed"}
									>
										Selesai
									</Button>
									<Button
										className="text-destructive"
										onClick={() => handleUpdateStatus(request._id, "cancelled")}
										size="sm"
										variant="ghost"
										disabled={request.status === "cancelled"}
									>
										<XCircle className="mr-1 h-4 w-4" />
										Batalkan
									</Button>
								</div>
							</div>
						</div>
					))
				)}
			</div>
		</div>
	);
}

function SummaryCard({
	icon,
	label,
	value,
}: {
	icon: ReactNode;
	label: string;
	value: number;
}) {
	return (
		<div className="rounded-2xl border border-border bg-muted/20 p-4">
			<div className="flex items-center gap-2 text-primary">
				{icon}
				<span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
			</div>
			<p className="mt-2 text-2xl font-black">{value}</p>
		</div>
	);
}

function getRequestTypeLabel(requestType: "call_staff" | "bring_dessert") {
	return requestType === "call_staff" ? "Call Staff" : "Bring Dessert";
}

function getRequestTypeClassName(requestType: "call_staff" | "bring_dessert") {
	return requestType === "call_staff"
		? "border-rose-200 bg-rose-50 text-rose-700"
		: "border-amber-200 bg-amber-50 text-amber-700";
}

function getStatusLabel(status: RequestStatus) {
	switch (status) {
		case "pending":
			return "Pending";
		case "acknowledged":
			return "Diproses";
		case "completed":
			return "Selesai";
		case "cancelled":
			return "Dibatalkan";
		default:
			return "Semua";
	}
}

function getStatusClassName(status: Exclude<RequestStatus, "all">) {
	switch (status) {
		case "pending":
			return "border-blue-200 bg-blue-50 text-blue-700";
		case "acknowledged":
			return "border-amber-200 bg-amber-50 text-amber-700";
		case "completed":
			return "border-emerald-200 bg-emerald-50 text-emerald-700";
		case "cancelled":
			return "border-slate-200 bg-slate-100 text-slate-700";
	}
}

