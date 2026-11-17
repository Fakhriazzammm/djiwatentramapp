-- Assets that are not gold can follow an estimated yearly change (houses up, cars and electronics down).
alter table finance.assets add column if not exists est boolean not null default false;
alter table finance.assets add column if not exists rate numeric;
