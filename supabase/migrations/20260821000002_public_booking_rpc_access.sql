-- Allow the public booking UI to call the validated SECURITY DEFINER RPCs directly.
-- The RPCs do not expose table access and validate capacity, products, token, and idempotency.
grant execute on function public.create_public_booking(jsonb, text, text, text) to anon, authenticated;
grant execute on function public.get_public_booking_status(text, text, text) to anon, authenticated;
notify pgrst, 'reload schema';
