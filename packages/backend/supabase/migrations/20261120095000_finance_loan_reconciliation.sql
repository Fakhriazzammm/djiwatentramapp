-- finance is hosted by djiwapay-api. The API migrator runs this after 0020_loans.sql.
do $$
begin
  if to_regclass('finance.loans') is not null then
    alter table finance.loans
      add column if not exists asset_id text,
      add column if not exists mail_revision integer not null default 0;
  end if;
end
$$;
