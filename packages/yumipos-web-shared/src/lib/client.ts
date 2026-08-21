import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

/**
 * Klien Supabase bersama untuk semua app web.
 *
 * Sesi DIPERTAHANKAN di localStorage dan di-refresh otomatis. Dulu di sini
 * dipakai storage in-memory dengan `persistSession: false`, alasannya token
 * basi dari login lama bikin 403. Akar masalahnya sebenarnya bukan storage:
 * `loginWithPin` memanggil endpoint GoTrue yang tidak ada (POST /admin/sessions,
 * selalu 404), jadi sesi Supabase tidak pernah benar-benar terbit dan yang
 * tersimpan hanya sisa token yang memang tidak valid.
 *
 * Sekarang sesi diterbitkan dengan benar (role `authenticated`), jadi
 * menyimpannya adalah yang tepat — tanpa ini setiap refresh halaman
 * menjatuhkan user kembali ke hak `anon` dan semua operasi tulis gagal.
 */
export function createClient() {
	if (!browserClient) {
		const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "https://supabase.yumme.id";
		const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
		if (!supabaseKey) throw new Error("Supabase client key is not configured.");
		browserClient = createSupabaseClient(
			supabaseUrl,
			supabaseKey,
			{
				auth: {
					persistSession: true,
					autoRefreshToken: true,
					// App memakai token sesinya sendiri; tidak ada alur redirect OAuth.
					detectSessionInUrl: false,
				},
			}
		);
	}

	return browserClient;
}
