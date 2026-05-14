-- Add category column to pos.inventory for AI-based categorization
-- Applied after ALTER TABLE was run directly via API.
ALTER TABLE pos.inventory ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'kitchen';
