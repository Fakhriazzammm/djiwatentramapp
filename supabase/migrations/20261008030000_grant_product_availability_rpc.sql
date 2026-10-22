-- Ensure POS stock availability RPCs remain callable by browser roles.
-- The functions are SECURITY DEFINER; EXECUTE is the intended client boundary.

grant execute on function pos.update_product_availability_with_event(
  text, boolean, text, text, text, text, text
) to anon, authenticated;

grant execute on function pos.update_products_availability_with_events(
  text[], boolean, text, text, text, text, text
) to anon, authenticated;
