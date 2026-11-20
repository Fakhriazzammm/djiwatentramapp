-- What the model already decided for a shop, per person, so the same shop never costs a second call.
create table if not exists finance.ai_category_cache (
  user_id text not null, key text not null, kind text not null,
  category_id text not null, confidence real not null, source text not null default 'ai',
  hits integer not null default 0, updated_at timestamptz not null default now(),
  primary key (user_id, key, kind)
);
create index if not exists ai_category_cache_age on finance.ai_category_cache (user_id, updated_at);
