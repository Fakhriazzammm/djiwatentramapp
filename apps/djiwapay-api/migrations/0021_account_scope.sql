-- Each wallet is either personal or business. Existing wallets stay personal.
alter table finance.accounts add column if not exists scope text not null default 'personal';
alter table finance.accounts drop constraint if exists accounts_scope_check;
alter table finance.accounts add constraint accounts_scope_check check (scope in ('personal','business'));
