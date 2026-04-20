create schema if not exists legacy_mirror;

create table if not exists legacy_mirror.documents (
  table_name text not null,
  document_id text not null,
  creation_time double precision,
  document jsonb not null,
  source_path text,
  imported_at timestamptz not null default now(),
  primary key (table_name, document_id)
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'legacy_mirror'
      and table_name = 'documents'
      and column_name = 'creation_time'
      and data_type = 'bigint'
  ) then
    alter table legacy_mirror.documents
      alter column creation_time type double precision
      using creation_time::double precision;
  end if;
end $$;

create index if not exists idx_legacy_mirror_documents_table_name
  on legacy_mirror.documents (table_name);

create index if not exists idx_legacy_mirror_documents_creation_time
  on legacy_mirror.documents (creation_time);

create index if not exists idx_legacy_mirror_documents_doc_gin
  on legacy_mirror.documents using gin (document);

create table if not exists legacy_mirror.import_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source_dir text not null,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  failed_count integer not null default 0,
  notes text
);

