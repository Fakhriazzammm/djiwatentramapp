-- Customer Community engagement: one like per customer and moderated comments.
create table if not exists public.customer_community_post_likes (
  post_id uuid not null references public.customer_community_posts(id) on delete cascade,
  customer_source_id text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, customer_source_id)
);

create index if not exists customer_community_post_likes_customer_idx
  on public.customer_community_post_likes (customer_source_id, created_at desc);

create table if not exists public.customer_community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.customer_community_posts(id) on delete cascade,
  author_source_id text not null,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  moderation_status text not null default 'published'
    check (moderation_status in ('published', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create index if not exists customer_community_comments_post_idx
  on public.customer_community_comments (post_id, created_at asc, id asc)
  where moderation_status = 'published' and deleted_at is null;

create index if not exists customer_community_comments_author_idx
  on public.customer_community_comments (author_source_id, created_at desc);

alter table public.customer_community_post_likes enable row level security;
alter table public.customer_community_comments enable row level security;

revoke all on public.customer_community_post_likes from anon, authenticated;
revoke all on public.customer_community_comments from anon, authenticated;
grant all on public.customer_community_post_likes to service_role;
grant all on public.customer_community_comments to service_role;

drop trigger if exists customer_community_comments_touch_updated_at on public.customer_community_comments;
create trigger customer_community_comments_touch_updated_at
before update on public.customer_community_comments
for each row execute function public.customer_community_touch_updated_at();

comment on table public.customer_community_post_likes is 'One durable like per customer per Community post.';
comment on table public.customer_community_comments is 'Customer Community comments; moderated and soft-deletable.';
