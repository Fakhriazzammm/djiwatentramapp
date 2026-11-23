-- Old-mail sync: an import can be limited to some banks (a newly found bank) and can start where the last one stopped.
alter table finance.gmail_import add column if not exists issuers text[];
alter table finance.gmail_import add column if not exists mode text not null default 'period';
