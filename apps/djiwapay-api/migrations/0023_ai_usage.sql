-- How many AI calls a person used today, so categorizing can never run up a bill.
create table if not exists finance.ai_usage (
  user_id text not null, day date not null, calls integer not null default 0,
  primary key (user_id, day)
);
