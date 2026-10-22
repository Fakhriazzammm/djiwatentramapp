import type { SupabaseClient } from "@supabase/supabase-js";

/** Allocate from the public wrapper's single WIB daily counter, for every source. */
export async function allocateDailyReceiptNo(client: Pick<SupabaseClient, "rpc">): Promise<number> {
	const { data, error } = await client.rpc("next_daily_receipt_no", { p_order_kind: "all" });
	if (error) throw error;
	const receiptNo = typeof data === "number" || typeof data === "string" ? Number(data) : NaN;
	if (!Number.isSafeInteger(receiptNo) || receiptNo <= 0) {
		throw new Error("Gagal mendapatkan nomor struk. Silakan coba lagi.");
	}
	return receiptNo;
}
