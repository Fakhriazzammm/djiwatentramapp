-- Migration: Expose completed_items column in pos_order_status view
-- The column already exists on pos.order_status (jsonb), but the view
-- public.pos_order_status was missing it, causing "column does not exist" errors.
-- Run:  docker exec -e PGPASSWORD=supabase_local_password supabase-db psql -U supabase_admin -d postgres -f supabase/migrations/20260727_completed_items_view.sql

ALTER TABLE pos.order_status ADD COLUMN IF NOT EXISTS completed_items jsonb DEFAULT '[]';
DROP VIEW IF EXISTS public.pos_order_status;
CREATE VIEW public.pos_order_status AS
 SELECT id,
    order_no,
    group_type,
    status,
    order_type,
    customer_name,
    items,
    completed_items,
    struk_line,
    dibuat_by,
    selesai_by,
    dibuat_at,
    selesai_at,
    message_id,
    chat_id,
    created_at,
    updated_at,
    base_text,
    telegram_user_id
   FROM pos.order_status;