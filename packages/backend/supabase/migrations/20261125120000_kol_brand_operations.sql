create table pos.kol_brand_operations (
  campaign_id bigint primary key references pos.kol_brand_campaigns(campaign_id),
  review_sla_hours integer not null check (review_sla_hours between 1 and 720),
  internal_note text not null default '' check (length(internal_note) <= 1000),
  updated_by text not null,
  updated_at timestamptz not null default now()
);

alter table pos.kol_brand_operations enable row level security;
revoke all on pos.kol_brand_operations from public, anon, authenticated;
