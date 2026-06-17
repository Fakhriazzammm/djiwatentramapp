-- Migration: Guest Reviews
-- Step 1: Drop FK constraint on user_id
ALTER TABLE shopper_reviews DROP CONSTRAINT IF EXISTS shopper_reviews_user_id_fkey;

-- Step 2: Make user_id nullable
ALTER TABLE shopper_reviews ALTER COLUMN user_id DROP NOT NULL;

-- Step 3: Add guest columns
ALTER TABLE shopper_reviews ADD COLUMN IF NOT EXISTS guest_name text;
ALTER TABLE shopper_reviews ADD COLUMN IF NOT EXISTS guest_email text;

-- Step 4: Drop existing insert policy and recreate with guest support
DROP POLICY IF EXISTS shopper_reviews_insert_own ON shopper_reviews;

CREATE POLICY shopper_reviews_insert_own ON shopper_reviews
  FOR INSERT
  WITH CHECK (
    -- Authenticated users: their own review
    (auth.uid() = user_id)
    OR
    -- Guest users: must have guest_name, user_id must be null
    (user_id IS NULL AND guest_name IS NOT NULL)
  );

-- Step 5: Ensure SELECT policy allows reading all
DROP POLICY IF EXISTS shopper_reviews_select_public ON shopper_reviews;
CREATE POLICY shopper_reviews_select_public ON shopper_reviews
  FOR SELECT
  USING (true);

-- Step 6: Re-add FK constraint with ON DELETE SET NULL
-- (so Supabase schema cache can still resolve shopper_reviews -> profiles join)
ALTER TABLE shopper_reviews
  ADD CONSTRAINT shopper_reviews_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id)
  ON DELETE SET NULL;
