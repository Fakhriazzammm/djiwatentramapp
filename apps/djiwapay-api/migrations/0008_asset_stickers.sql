-- Gold, jewelry and other assets with a photo sticker, purchase data and market valuation.
alter table finance.assets add column if not exists sub text;
alter table finance.assets add column if not exists weight numeric(12,3);
alter table finance.assets add column if not exists purity numeric(6,4);
alter table finance.assets add column if not exists bought_on text;
alter table finance.assets add column if not exists cost numeric(18,2);
alter table finance.assets add column if not exists shop text;
alter table finance.assets add column if not exists note text;
alter table finance.assets add column if not exists sticker_id text;
alter table finance.assets add column if not exists auto boolean not null default false;

create table if not exists finance.asset_stickers (
  user_id text not null, id text not null,
  raw_path text, final_path text, source text not null default 'local',
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Daily reference prices (shared by all users). gold = IDR per gram of 24K gold.
create table if not exists finance.market_prices (
  code text not null, day date not null, price numeric(18,2) not null,
  primary key (code, day)
);
