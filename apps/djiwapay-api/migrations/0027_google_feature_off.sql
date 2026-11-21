-- Per-service switches on the Integrasi page. The Google grant stays; these only stop Djiwa Pay from using a service.
-- Keys: calendar, sheets, receipts. Existing rows and files stay as they are.
alter table finance.google_connections add column if not exists off_features text[] not null default '{}';
