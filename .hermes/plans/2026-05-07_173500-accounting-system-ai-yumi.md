# Plan: Accounting System + AI + Yumi Finance Agent

**Date:** 2026-05-07
**Status:** Draft
**Author:** Planning agent
**Related:** [PLAN_ACCOUNTING_SYSTEM.md](/opt/djiwatentramapp/PLAN_ACCOUNTING_SYSTEM.md)

---

## Goal

Transform the current simple income/expense transaction system (single-column "Nominal" with +/- signs) into a **double-entry accounting system** powered by **AI auto-classification** and fully integrated with **Yumi Finance Agent (Telegram)** — while keeping the existing Simple View intact for daily operational use.

---

## Current Context

From the screenshot (07 May 2026):

| Item | Value |
|---|---|
| Total Income | Rp 1.864.000 |
| Total Expense | Rp 654.000 |
| Net | Rp 1.210.000 |
| Transactions | 36 tx |
| Columns | NO, TANGGAL, ID, SUMBER, PEMBAYARAN, DESKRIPSI, NOMINAL, AKSI |

**Problems:**
- Single "NOMINAL" column mixes income (+) and expense (−) with color coding — not accounting standard
- No Chart of Accounts (COA) classification — just loose categories like "Penjualan", "Bahan Baku"
- No double-entry verification (debit must equal kredit)
- No AI-assisted classification — user must choose category manually
- Reconciliation is manual (cash physical vs system)
- Duplicate detection exists but basic (same amount + 5 min window)

**Assumptions:**
- Existing `pos.financial_transactions` table schema stays unchanged
- New tables use the same Supabase project (`xaemykhjpkgypqqpfdcb`)
- Yumi Finance Agent is the primary interface (Telegram) — web admin is secondary
- `gte-small` embedding model is available via Supabase Edge Function or external API
- Existing shift close, OCR, and order flows continue to work without regression

---

## Proposed Approach

### Architecture

```
Telegram (User)
    │
    ▼
Yumi Finance Agent @YummeFinanceAIbot
    │
    ├─ OCR → scanItems → AI Classify COA
    ├─ Manual entry → AI Suggest COA
    ├─ Shift close → Auto reconcile
    ├─ Accounting query → Langsung jawab
    │
    ▼
Supabase
    ├─ financial_transactions (existing — UNCHANGED)
    ├─ accounting_chart_of_accounts  (NEW)
    ├─ accounting_entries            (NEW — FK to financial_tx)
    ├─ accounting_item_embeddings    (NEW — pgvector)
    └─ accounting_reconciliation_logs (NEW)
    │
    ▼
Web Admin (pos.djiwatentram.web.id)
    ├─ Simple View (existing — UNCHANGED)
    └─ Accounting View (NEW — DEBIT | KREDIT | AKUN columns)
```

### Key Principle: No Regression

- Zero changes to existing `financial_transactions` schema
- Zero changes to existing OCR insertion flow
- Zero changes to existing order → income flow
- Zero changes to existing shift close flow
- Accounting tables are **additive** — entries are created alongside existing data
- Simple View still works exactly as before

---

## Step-by-Step Plan

### Phase 1: Database (Day 1)

**1.1 Create `accounting_chart_of_accounts` table**

Standard COA for F&B business (~30 accounts):

| Kode | Nama | Tipe | Normal Balance |
|---|---|---|---|
| 1-1000 | Kas Tunai | asset | debit |
| 1-1100 | Kas QRIS | asset | debit |
| 1-2000 | Persediaan Bahan Baku | asset | debit |
| 3-1000 | Modal Pemilik | equity | kredit |
| 4-1000 | Pendapatan Penjualan | revenue | kredit |
| 5-2000 | Beban Bahan Baku | expense | debit |
| 5-1000 | Beban Gaji | expense | debit |
| ... | (30 total) | | |

**1.2 Create `accounting_entries` table**

```sql
create table accounting_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id text not null references pos.financial_transactions(source_id),
  coa_id uuid not null references accounting_chart_of_accounts(id),
  entry_type text not null check (entry_type in ('debit', 'kredit')),
  amount numeric(18,2) not null check (amount >= 0),
  description text,
  item_index integer,
  created_at timestamptz default now()
);
```

Constraint: `CHECK (entry_type IN ('debit', 'kredit'))` + amount always positive (direction is in entry_type).

**1.3 Create `accounting_item_embeddings` table** (with pgvector)

```sql
create table accounting_item_embeddings (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  coa_id uuid not null references accounting_chart_of_accounts(id),
  embedding vector(384),
  usage_count integer default 1,
  last_used_at timestamptz default now()
);
create index on accounting_item_embeddings using ivfflat (embedding vector_cosine_ops);
```

**1.4 Create `accounting_reconciliation_logs` table**

```sql
create table accounting_reconciliation_logs (
  id uuid primary key default gen_random_uuid(),
  shift_id text not null,
  reconciled_at timestamptz default now(),
  total_debit numeric(18,2),
  total_kredit numeric(18,2),
  selisih numeric(18,2),
  cash_system numeric(18,2),
  cash_physical numeric(18,2),
  cash_selisih numeric(18,2),
  status text check (status in ('balanced', 'unbalanced')),
  notes text
);
```

**1.5 Seed COA data (SQL migration)**

Insert initial 30+ accounts for Djiwa Tentram (F&B specific).

**1.6 Backfill script (retroactive)**

Generate `accounting_entries` for ALL existing `financial_transactions`:
- Income transactions → 1 entry (Kredit: Pendapatan) + 1 entry (Debit: Kas)
- Expense transactions per scanItem → each item → Debit to appropriate COA
- No embedding generation yet (just structural entries)

### Phase 2: Web UI — Accounting View (Days 2-3)

**2.1 Add toggle button**

On the transactions page header bar, add:
```
[⚡ Simple] [📊 Accounting]
```
- `simple` = current view (default)
- `accounting` = new view

**2.2 Replace NOMINAL column with DEBIT + KREDIT**

When in Accounting View:
| AKUN / COA | DEBIT | KREDIT | ✅ |
|---|---|---|---|
| Pendapatan Penjualan (4-1000) | — | Rp 45.000 | ✅ |
| Kas QRIS (1-1100) | Rp 45.000 | — | ✅ |

**2.3 Add reconciled badge column**

- ✅ = debit == kredit
- ❌ = mismatch
- ⚠️ = anomaly detected

**2.4 Create COA filter dropdown**

Filter transactions by specific account.

**2.5 Update summary bar**

Replace `↑ Income / ↓ Expense / = Net` with:
```
Total Debit: Rp 654.000  │  Total Kredit: Rp 1.669.000  │  Selisih: Rp 1.015.000 ✅ BALANCE
```

**Files changed:**
- `transaction-detail-report.tsx` — toggle, new columns, summary
- Possibly a new `accounting-transaction-report.tsx` if too complex to merge

### Phase 3: AI — COA Auto-Classification (Days 4-6)

**3.1 Edge Function: Generate embedding**

```
POST /functions/v1/generate-embedding
Body: { text: "Terigu Kompas 1kg" }
Response: { embedding: [0.001, 0.002, ...], dimensions: 384 }
```

Using `gte-small` model (384-dim, fast, runs on CPU).

**3.2 Edge Function: Classify item to COA**

```
POST /functions/v1/classify-item
Body: { 
  item_name: "Terigu Kompas 1kg", 
  amount: 66000,
  transaction_category: "Bahan Baku" (optional fallback)
}
Response: {
  coa_id: "uuid...",
  coa_code: "5-2000",
  coa_name: "Beban Bahan Baku",
  confidence: 0.97,
  alternatives: [...]
}
```

Logic:
1. Exact match in `item_embeddings` → return that COA (100%)
2. Fuzzy/embedding similarity > 0.95 → auto-apply
3. Similarity > 0.80 → return top-3 suggestions
4. No match → use LLM (gpt-4o-mini) + save new embedding

**3.3 Anomaly detection function**

Scan new entries for:
- Amount outlier (> 3σ from mean for that COA)
- Duplicate within 5 min window (improve on existing basic detection)
- COA mismatch (low embedding similarity to chosen COA)
- Debit ≠ Kredit (structural check)

**Files changed:**
- New Edge Function: `generate-embedding`
- New Edge Function: `classify-item`
- New Edge Function: `detect-anomalies`

### Phase 4: Yumi Finance Agent Integration (Days 7-9)

**4.1 Dual-write after OCR**

After existing OCR insert to `financial_transactions`, add:

```typescript
// After existing insert succeeds
const entries = [];
for (const item of scanItems) {
  const coa = await classifyItem(item.name, item.total);
  entries.push({ transaction_id, coa_id: coa.id, entry_type: 'debit', amount: item.total, description: item.name });
}
// Also add kredit entry to Kas
entries.push({ transaction_id, coa_id: kasAccount.id, entry_type: 'kredit', amount: totalAmount, description: 'Pembayaran ' + paymentMethod });
await supabase.from('accounting_entries').insert(entries);
```

**4.2 Telegram accounting query handler**

New intent handler in Yumi Finance Agent:

| Pattern | Action |
|---|---|
| "cek akun {name/code}" | `SELECT sum(debit), sum(kredit) FROM accounting_entries WHERE coa = X` |
| "total debit kredit {period}" | Aggregation by date range |
| "cek anomali" | `SELECT * FROM anomalies WHERE date = today` |
| "rekonsiliasi shift {name}" | `SELECT * FROM reconciliation_logs WHERE shift = X` |
| "daftar akun" | `SELECT * FROM chart_of_accounts WHERE is_active` |
| "tambah akun {name} ({code})" | INSERT to chart_of_accounts |
| "gabung akun {from} ke {to}" | UPDATE accounting_entries SET coa_id = to WHERE coa_id = from |
| "tutup buku {date}" | Generate end-of-day report |

**4.3 Auto-reconciliation on shift close**

When `useHybridEndShift` completes:

1. Query all `accounting_entries` for this shift's time range
2. Sum debit, sum kredit
3. Calculate cash_physical vs cash system
4. Insert `reconciliation_logs`
5. Send notification to finance group

**4.4 Scheduled reports (cron)**

- Daily 23:00 → summary to finance group
- Weekly Sunday 20:00 → weekly comparison

**Files changed:**
- `use-hybrid-write-actions.ts` — dual-write after shift close
- Yumi Finance Agent OCR handler — dual-write after OCR
- Yumi Finance Agent message router — new accounting intents
- New cron job definitions

### Phase 5: Polish & Validation (Days 10-11)

**5.1 Web UI — COA manager page**

Simple CRUD for Chart of Accounts:
- List all accounts (tree/hierarchy view)
- Add/edit/deactivate account
- Merge accounts (reassign entries)
- Show balance per account

**5.2 Smart suggestion in manual entry dialog**

When user types description in "Catat" modal:
- Debounced → call classify-item
- Show COA suggestion dropdown with confidence

**5.3 Anomaly badge in Simple View**

Even in Simple View, show ⚠️ badge on rows with detected anomalies.

**5.4 Export to accounting software**

Generate CSV/PDF with proper debit/kredit columns for:
- Import to Excel
- Integration with external accounting software

---

## Files Likely to Change

### Database (Supabase Migration)
- `supabase/migrations/20260507_accounting_schema.sql` — all new tables + COA seed

### Backend / Edge Functions
- `supabase/functions/generate-embedding/index.ts` — NEW
- `supabase/functions/classify-item/index.ts` — NEW
- `supabase/functions/detect-anomalies/index.ts` — NEW

### Frontend
- `apps/web/src/routes/admin/finance/transactions/-components/transaction-detail-report.tsx` — Accounting View toggle + columns
- `apps/web/src/routes/admin/finance/transactions/-components/accounting-transaction-report.tsx` — NEW (maybe)
- `apps/web/src/routes/admin/finance/accounting/route.tsx` — COA manager page (NEW)
- `apps/web/src/hooks/use-hybrid-accounting-data.ts` — NEW hook for accounting queries

### Yumi Finance Agent
- `apps/web/src/hooks/use-hybrid-write-actions.ts` — dual-write for shift close
- Yumi OCR flow — dual-write after OCR (in Hermes agent or edge function)
- Yumi message router — accounting intents

### DevOps
- Enable pgvector extension on Supabase project
- Deploy Edge Functions

---

## Tests / Validation

| Test | Method | Expected |
|---|---|---|
| Accounting entries count | `SELECT count(*)` after OCR | 2 × items count + 1 kredit |
| Debit == Kredit | `SELECT sum(debit), sum(kredit)` | Equal |
| Existing OCR still works | Run OCR without accounting tables | Same as before |
| Simple View unchanged | Screenshot comparison | Identical |
| COA classify accuracy | Manual review of 50 items | > 90% correct |
| Anomaly detection precision | Inject known duplicates | 100% detection |
| Shift reconcile notification | Close shift, check Telegram | Notification sent |
| Accounting query response | Send "cek akun bahan baku" | Correct total in < 2s |

---

## Risks, Tradeoffs, and Open Questions

| Risk | Mitigation |
|---|---|
| pgvector not available on Supabase plan | Use `lite` tier or switch to `text-embedding-3-small` via OpenAI API |
| Edge Function cold start >1s | Use warm-up cron pings or keep 1 instance hot |
| Backfill 84 existing shift-close records | Batch job with rate limiting; manual review if COA unclear |
| User confusion with debit/kredit terminology | Keep Simple View as default; tooltip explanations |
| Embedding model inference cost | `gte-small` runs CPU inference; ~500 items/month → negligible |
| Order income double-entry complexity | Auto-generate both debit (Kas) and kredit (Pendapatan) from single order event |

**Open Questions:**
1. Should `accounting_item_embeddings` use Supabase pgvector or external vector DB?
   → *Proposed: Supabase pgvector (simpler, no new infra)*
2. For order income entries, should we itemize (debit per product sold) or aggregate (1 kredit for total)?
   → *Proposed: Aggregate for now (1 kredit: Pendapatan). Itemized can be added later via order_items join*
3. Should the existing "Setoran Akhir" entries (now amount=0) still generate accounting entries?
   → *Proposed: Yes — they represent the physical cash count. DEBIT: Kas, KREDIT: Pendapatan*
4. Anomaly notifications: push to Telegram group or only visible in web UI?
   → *Proposed: Both — badge in web UI + push to finance group for critical anomalies (debit≠kredit)*

---

## Next Step Recommendation

Start with **Phase 1 (Database)** — specifically:
1. Enable pgvector extension
2. Create `accounting_chart_of_accounts` + seed COA
3. Create `accounting_entries` table
4. Run backfill for existing transactions

This is the foundation everything else depends on, and it's purely additive (zero risk to existing system).
