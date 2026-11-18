// Email secrets live in pos.email_settings (service role only) so they can be rotated without
// recreating the Edge Functions container. A real environment variable of the same name wins.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const cache = new Map<string, { value: string; at: number }>();
const TTL_MS = 60_000;

export async function emailSetting(admin: SupabaseClient, name: string): Promise<string> {
	const fromEnv = Deno.env.get(name)?.trim();
	if (fromEnv) return fromEnv;
	const hit = cache.get(name);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
	const { data, error } = await admin.schema("pos").from("email_settings").select("value").eq("key", name).maybeSingle();
	if (error) throw error;
	const value = String(data?.value ?? "").trim();
	if (value) cache.set(name, { value, at: Date.now() });
	return value;
}
