-- Distinguish "the user set up e-mail forwarding" from "a source row exists because Gmail direct is on".
alter table finance.inbound_sources add column if not exists forwarding boolean not null default false;
update finance.inbound_sources set forwarding = true;   -- every row before this migration was made by the forwarding setup
