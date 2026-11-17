-- Manager: bridge pengeluaran bot Telegram ke tabel draf pengeluaran Manager.
-- Bot menulis finance_source_id = pos.financial_transactions.source_id.
create unique index if not exists uq_mgr_expense_drafts_finance_source
  on public.mgr_expense_drafts (finance_source_id);

create index if not exists idx_mgr_expense_drafts_channel
  on public.mgr_expense_drafts (channel, created_at desc);
