-- Rencana: a goal can have a target date, and a debt can be repaid in parts.
alter table finance.goals add column if not exists due text;
alter table finance.debts add column if not exists payments jsonb not null default '[]'::jsonb;
