-- Disable legacy Yumi Poin accrual after Djiwa Pay rollout.
-- Preserve customer_point_ledger and historical columns for audit; do not delete data.
DROP TRIGGER IF EXISTS trg_award_order_points ON pos.orders;
REVOKE EXECUTE ON FUNCTION pos.redeem_points(text, text, text, text, integer, text, text) FROM PUBLIC, anon, authenticated;
