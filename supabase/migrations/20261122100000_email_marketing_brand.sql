-- One email marketing engine, two brands: Djiwa Tentram (default) and Djiwa Pay (sent by apps/djiwapay-api).
-- Suppressions, the frequency cap and delivery webhooks stay shared; campaigns and templates are filtered by brand.
ALTER TABLE pos.email_campaigns ADD COLUMN IF NOT EXISTS brand text NOT NULL DEFAULT 'djiwatentram';
ALTER TABLE pos.email_templates ADD COLUMN IF NOT EXISTS brand text NOT NULL DEFAULT 'djiwatentram';
CREATE INDEX IF NOT EXISTS email_campaigns_brand_idx ON pos.email_campaigns (brand, created_at DESC);
