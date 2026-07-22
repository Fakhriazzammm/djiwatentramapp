-- =============================================================================
-- Fix: Add home_pin_fingerprint to anon SELECT grant on yumi_users
--
-- Root Cause: The hybrid PIN change flow (useHybridUpdateUserPin) reads
-- home_pin_fingerprint via getSessionUserByToken() to verify the old PIN
-- before allowing a PIN change.  The column was never added to the anon
-- SELECT column grant, so for users who logged in via local session fallback,
-- the field returned null, causing the old-PIN verification to be silently
-- skipped (security bypass).
--
-- Fix: Grant SELECT on home_pin_fingerprint to anon and authenticated roles.
-- This is safe because home_pin_fingerprint is a SHA-256 hash (not the
-- original PIN), and the stronger bcrypt home_pin_hash remains restricted.
-- =============================================================================

grant select (home_pin_fingerprint)
  on public.yumi_users to anon, authenticated;
