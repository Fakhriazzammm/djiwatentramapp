-- A category can be a sub category of another (one level). Budgets and charts roll it up to the parent.
alter table finance.categories add column if not exists parent_id text;
