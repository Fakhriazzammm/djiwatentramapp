-- PostgREST exposes the public schema RPC namespace in the POS client.
-- Keep a public wrapper so browser RPC calls resolve consistently.
CREATE OR REPLACE FUNCTION public.next_shift_receipt_no(p_shift_id text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = pos, public
AS $$ SELECT pos.next_shift_receipt_no(p_shift_id); $$;

CREATE OR REPLACE FUNCTION public.decrement_shift_receipt_no(p_shift_id text, p_last_no integer)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pos, public
AS $$ SELECT pos.decrement_shift_receipt_no(p_shift_id, p_last_no); $$;

GRANT EXECUTE ON FUNCTION public.next_shift_receipt_no(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decrement_shift_receipt_no(text, integer) TO anon, authenticated, service_role;
