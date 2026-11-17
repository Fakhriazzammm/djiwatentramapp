-- Past payment e-mails that were top-ups were recorded as spending. A top-up moves the person's own money into a wallet:
-- turn those entries into transfers (bank -> wallet). The original values are kept so this can be reversed.
create table if not exists finance.topup_fix_backup (
  user_id text not null, id text not null, kind text not null, category_id text not null, to_account_id text,
  fixed_at timestamptz not null default now(), primary key (user_id, id)
);

create temp table _topup as
select e.user_id, e.id,
  case
    when txt ~* 'shopee\s?pay' then 'shopeepay'
    when txt ~* 'go-?pay' then 'gopay'
    when txt ~* '\movo\M' then 'ovo'
    when txt ~* '\mdana\M' then 'dana'
    when txt ~* 'link\s?aja' then 'linkaja'
    else 'dompetdigital' end as slug
from (
  select e.user_id, e.id, concat_ws(' ', m.parsed->'details'->>'description', e.note, m.parsed->>'merchant', m.parsed->>'subject') as txt
  from finance.entries e
  join finance.inbound_messages m on m.entry_id = e.id and m.user_id = e.user_id
  where e.kind = 'out' and e.source = 'email' and m.parsed->>'subject' ~* 'top[ -]?up' and m.parsed->>'subject' !~* 'tidak berhasil|gagal'
) e;

insert into finance.accounts(user_id, id, name, type, opening)
select distinct t.user_id, 'email-' || t.slug,
  case t.slug when 'shopeepay' then 'ShopeePay' when 'gopay' then 'GoPay' when 'ovo' then 'OVO' when 'dana' then 'DANA' when 'linkaja' then 'LinkAja' else 'Dompet digital' end,
  'ewallet', 0
from _topup t on conflict do nothing;

insert into finance.topup_fix_backup(user_id, id, kind, category_id, to_account_id)
select e.user_id, e.id, e.kind, e.category_id, e.to_account_id from finance.entries e join _topup t on t.user_id = e.user_id and t.id = e.id
on conflict do nothing;

update finance.entries e set kind = 'tf', category_id = 'transfer', to_account_id = 'email-' || t.slug
from _topup t where e.user_id = t.user_id and e.id = t.id and e.kind = 'out';

insert into finance.profiles(user_id) select distinct user_id from _topup on conflict do nothing;
update finance.profiles set version = version + 1, updated_at = now() where user_id in (select user_id from _topup);
