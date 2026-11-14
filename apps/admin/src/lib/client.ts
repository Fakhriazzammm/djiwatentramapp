// Keep one browser Supabase client across app-local and shared modules.
// Multiple clients with the same auth storage key can race session refreshes.
export { createClient } from "@djiwaapps/web-shared/lib/client";
