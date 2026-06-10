-- Migration: Add CLIENT_VIEWER role for client demo viewing
-- This role hides all numbers/figures in the UI
insert into yumi_roles (source_id, name, permissions, raw)
values (
  gen_random_uuid()::text,
  'CLIENT_VIEWER',
  '["orders:view", "menu:view", "products:view", "kitchen:view", "pos:access"]',
  '{}'
);
