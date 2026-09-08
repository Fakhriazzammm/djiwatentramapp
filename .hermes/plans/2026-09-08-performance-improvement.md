# Djiwa Tentram Performance Improvement Plan

> **For Hermes:** Gunakan `subagent-driven-development` saat implementasi, dengan review spec dan code quality setelah setiap task.
>
> **Status:** Plan only — belum ada implementasi.
>
> **Audit date:** 2026-09-08 23:49 WIB
>
> **Scope:** Seluruh apps/project `/opt/djiwatentramapp`, fokus pada performa runtime dan asynchronous processing. Tidak menambahkan RabbitMQ, BullMQ, Kafka, atau Redis pada fase awal.

**Goal:** Mengurangi latency, query/reload berulang, risiko webhook timeout, dan backlog notifikasi tanpa mengorbankan konsistensi order, finance, inventory, attendance, payroll, dan payment.

**Architecture:** Pertahankan Supabase PostgreSQL sebagai source of truth. Gunakan database-backed queue untuk booking/payment jobs, worker terpisah untuk pekerjaan asynchronous, Supabase Realtime yang lebih granular, dan polling dengan cursor/interval yang sesuai. Broker eksternal hanya dievaluasi setelah benchmark menunjukkan PostgreSQL queue tidak mencukupi.

**Tech Stack:** React + Vite + Supabase PostgreSQL/Realtime/Edge Functions + Python Telegram agents + Cloudflare Workers/R2/KV + pg_cron.

---

## 1. Baseline Audit dan Acceptance Criteria

### Temuan terverifikasi

- Tidak ada dependency atau konfigurasi RabbitMQ, BullMQ, Kafka, Redis, AMQP, Celery, RQ, atau Kombu.
- Frontend memakai Supabase Realtime dengan polling fallback; schema-wide subscription berpotensi menyebabkan reload berlebih.
- `yumi-supervisor-agent` memiliki polling sekitar 5 detik.
- `yumi-ai-bot` memiliki polling sekitar 30 detik.
- Mayar webhook masih menjalankan verifikasi/settlement dalam satu request.
- Booking notification queue sudah ada di PostgreSQL dengan dedupe, retry state, index, dan `FOR UPDATE SKIP LOCKED`, tetapi worker delivery belum ditemukan.
- Booking reminder function bersifat enqueue-only; scheduler/consumer aktif belum ditemukan.
- Customer Stories membaca metadata R2 dengan pola list lalu get per object.
- Cloudflare KV/R2 digunakan sebagai managed storage, bukan Redis.

### Acceptance criteria lintas plan

- Tidak ada perubahan business rule order/payment/finance/inventory.
- Tidak ada duplicate settlement, duplicate financial transaction, atau duplicate Telegram notification.
- Semua asynchronous job memiliki idempotency key, retry policy, dan terminal failure state.
- Semua perubahan performa memiliki before/after measurement.
- Tidak ada production deploy sebelum test dan verification lulus.
- Tidak menambah broker eksternal sebelum benchmark dan approval arsitektur.

---

## 2. Dependency Graph

```text
Level 0 — Baseline dan observability
  ├── Task 1: ukur baseline database/API/worker/realtime
  └── Task 2: audit index dan query plan yang dipakai jalur kritis

Level 1 — Independen, dapat dikerjakan paralel setelah baseline
  ├── Task 3: granularisasi Supabase Realtime
  ├── Task 4: optimasi polling Supervisor dan General Manager
  ├── Task 5: worker booking notification PostgreSQL
  ├── Task 6: scheduler booking reminders
  └── Task 7: kurangi R2 Stories N+1

Level 2 — Bergantung pada worker/job contract
  └── Task 8: ubah Mayar webhook menjadi enqueue cepat + processor async

Level 3 — Verifikasi dan keputusan scaling
  ├── Task 9: load test dan failure/retry test
  └── Task 10: keputusan apakah Redis/BullMQ diperlukan
```

---

## 3. Task Detail

### Task 1: Buat baseline performance read-only

**Profile:** `subagent-qa-tester` atau backend engineer.

**Objective:** Mendapatkan angka baseline sebelum perubahan.

**Files:**
- Inspect only: `PROJECT.md`
- Inspect only: `yumi-supervisor-agent/app.py`
- Inspect only: `yumi-ai-bot/app.py`
- Inspect only: `supabase/functions/mayar-webhook/index.ts`
- Inspect only: `supabase/migrations/20260823000004_booking_timeline_notification_queue.sql`
- Inspect only: `supabase/migrations/20260823000005_booking_notification_queue_worker.sql`
- Inspect only: `workers/customer-stories/src/index.ts`

**Langkah:**

1. Catat latency p50/p95/p99 untuk endpoint payment dan query jalur order.
2. Catat durasi satu siklus Supervisor dan jumlah query per siklus.
3. Catat jumlah listener Realtime dan reload yang dipicu.
4. Catat queue depth, oldest queued item, retry count, dan failed count untuk booking jika data production tersedia.
5. Gunakan `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` hanya untuk query read-only yang sudah diidentifikasi.
6. Simpan hasil baseline ke artifact audit, bukan production table.

**Verifikasi:**

```bash
# Contoh — sesuaikan endpoint dan credential melalui environment, jangan hardcode secret
curl -sS -w '\nHTTP=%{http_code} TOTAL=%{time_total}\n' \
  --max-time 30 'https://<endpoint>/health'
```

Expected: baseline memiliki timestamp, endpoint/query, sample size, p50/p95/p99, error rate, dan environment.

---

### Task 2: Audit index dan query plan jalur kritis

**Profile:** `subagent-database`.

**Objective:** Memastikan bottleneck database diukur sebelum menambah cache atau broker.

**Files:**
- Inspect: `supabase/migrations/*.sql`
- Modify only after approval: additive migration baru di `supabase/migrations/`
- Test: SQL explain artifact di `.qa/` atau `/tmp/`

**Langkah:**

1. Audit query booking queue berdasarkan `(status, available_at)`.
2. Audit filter order berdasarkan timestamp/cursor/status.
3. Audit query Supervisor untuk settled order, booking transaction, CSR, dan closed shift.
4. Audit query Stories/community berdasarkan pagination dan owner/story key.
5. Tambahkan index hanya jika `EXPLAIN ANALYZE` menunjukkan sequential scan atau sort berat pada dataset nyata.
6. Semua migration harus additive, idempotent, dan tidak drop/rename data historis.

**Verifikasi:**

- `EXPLAIN ANALYZE` before/after.
- Query result count sama sebelum dan sesudah.
- Tidak ada lock panjang atau migration yang memblokir transaksi aktif.

---

### Task 3: Granularisasi Supabase Realtime

**Profile:** `subagent-frontend` + review backend.

**Objective:** Mengurangi reload yang tidak relevan dari subscription schema-wide.

**Files:**
- Inspect/modify: hook live-data yang menggunakan `useSupabaseLiveValue()`
- Inspect: `apps/*/src/hooks/`
- Inspect: `packages/yumipos-web-shared/src/hooks/`
- Test: unit/integration test hook realtime yang sudah ada atau test baru di lokasi konvensi repo

**Langkah:**

1. Petakan setiap listener ke tabel yang benar-benar diperlukan.
2. Pisahkan subscription order, order status, inventory, finance, booking, attendance, dan payroll.
3. Pertahankan polling fallback 30 detik dan shift report 10 detik sebagai fallback awal.
4. Tambahkan debounce/coalescing agar beberapa event dalam window pendek hanya menghasilkan satu reload.
5. Jangan mengubah source of truth atau urutan state bisnis.
6. Pastikan `triggerHybridRefresh()` tidak menjadi reload semua domain untuk perubahan lokal yang kecil.

**Verifikasi:**

- Simulasikan perubahan pada satu tabel dan pastikan hanya listener relevan yang reload.
- Pastikan UI POS/Kitchen/Bar tetap menerima status order.
- Pastikan reconnect/error channel tetap memakai polling fallback.
- Bandingkan jumlah network request dan render sebelum/after.

---

### Task 4: Optimasi polling Supervisor dan General Manager

**Profile:** `subagent-backend`.

**Objective:** Mengurangi query polling yang tidak perlu tanpa kehilangan event baru.

**Files:**
- Modify: `yumi-supervisor-agent/app.py`
- Inspect/modify: `yumi-ai-bot/app.py`
- Test: test/helper untuk cursor, dedupe, startup baseline, dan bounded lookback

**Langkah:**

1. Pertahankan cursor canonical yang sudah dipakai untuk dedupe.
2. Pastikan query incremental memakai timestamp/id boundary dan index yang sesuai.
3. Pisahkan interval pekerjaan:
   - order/status: interval cepat
   - payment reconciliation: interval tersendiri
   - lookup master data: interval lebih panjang
   - closed shift/report: interval lebih panjang
4. Tambahkan single-flight guard agar siklus baru tidak overlap dengan siklus sebelumnya.
5. Tambahkan metric durasi tiap sub-check dan jumlah row yang diperiksa.
6. Pertahankan startup baseline tanpa mengirim ulang historical notification.
7. Jangan menaikkan frekuensi polling sebagai solusi default.

**Verifikasi:**

- Restart process tidak mengirim ulang backlog lama.
- Order baru tetap terdeteksi dalam target latency yang disepakati.
- Duplicate message count tetap nol pada replay/retry test.
- Satu process tidak menjalankan dua polling cycle bersamaan.

---

### Task 5: Implementasikan worker booking notification berbasis PostgreSQL

**Profile:** `subagent-backend`.

**Objective:** Mengubah queue contract yang sudah ada menjadi delivery pipeline aktif tanpa broker baru.

**Files:**
- Inspect: `supabase/migrations/20260823000004_booking_timeline_notification_queue.sql`
- Inspect: `supabase/migrations/20260823000005_booking_notification_queue_worker.sql`
- Inspect: `supabase/migrations/20260823000007_booking_reminder_queue.sql`
- Create/modify: worker runtime pada lokasi deployment yang disetujui
- Test: unit test claim/retry/dedupe dan provider mock

**Langkah:**

1. Gunakan `claim_booking_notification_deliveries()` sebagai satu-satunya cara claim.
2. Kirim berdasarkan channel `internal`, `whatsapp`, atau `telegram` melalui adapter eksplisit.
3. Panggil `complete_booking_notification_delivery()` setelah hasil provider diketahui.
4. Gunakan retry delay bertahap dan batas maksimum attempt.
5. Tandai kegagalan terminal sebagai `failed` dengan `last_error` yang aman.
6. Jangan mengirim ulang row `sent`.
7. Tambahkan worker lock/identity agar dua instance tetap aman.
8. Tambahkan metric queue depth, oldest item, attempts, success, retry, dan permanent failure.

**Verifikasi:**

- Dua worker paralel tidak mengambil row yang sama.
- Simulasi timeout provider menghasilkan `retrying`, bukan duplicate send tanpa kontrol.
- Provider sukses menghasilkan satu delivery `sent`.
- Dedupe key tetap mencegah notification ganda.

---

### Task 6: Aktifkan scheduler booking reminders

**Profile:** `subagent-database` + `subagent-backend`.

**Objective:** Menjalankan `enqueue_due_booking_reminders()` secara terjadwal dan idempotent.

**Files:**
- Inspect: `supabase/migrations/20260823000007_booking_reminder_queue.sql`
- Create/modify: additive `pg_cron` migration atau scheduler worker sesuai deployment approval
- Test: SQL test untuk H-1, pre-arrival, late-arrival, pending-payment

**Langkah:**

1. Pilih satu scheduler canonical; jangan membuat Hermes cron dan system cron untuk job yang sama.
2. Jalankan fungsi dengan batch limit bounded.
3. Pastikan dedupe schedule reference mencegah enqueue berulang.
4. Pastikan timezone WIB/Asia-Jakarta digunakan konsisten.
5. Pantau waktu eksekusi dan row count per run.

**Verifikasi:**

- Reminder yang sama tidak menghasilkan lebih dari satu delivery.
- Booking yang tidak eligible tidak masuk queue.
- Scheduler gagal dapat terdeteksi dan diulang aman.

---

### Task 7: Kurangi N+1 pada Customer Stories

**Profile:** `subagent-frontend` atau `subagent-backend`.

**Objective:** Mengurangi latency feed Stories dan tekanan ke R2/KV.

**Files:**
- Modify: `workers/customer-stories/src/index.ts`
- Modify if approved: schema/index metadata Stories atau storage mapping
- Test: Worker request tests untuk list feed, block, view, expiry

**Langkah:**

1. Ukur jumlah object dan latency list feed saat ini.
2. Hindari menjadikan `R2Bucket.list()` + `get()` per object sebagai primary metadata index.
3. Simpan metadata feed pada index yang dapat dipaginasi; R2 tetap menjadi media store.
4. Pertahankan expiry 24 jam, ownership, block/report, dan view dedupe.
5. Batasi page size dan gunakan cursor.
6. Jangan memperkenalkan Redis hanya untuk mengatasi N+1.

**Verifikasi:**

- Feed menghasilkan data yang sama.
- Request count turun dari N+1.
- Media URL, expiry, block, report, dan view tetap benar.
- Worker tetap memenuhi batas waktu Cloudflare.

---

### Task 8: Ubah Mayar webhook menjadi enqueue cepat + processor async

**Profile:** `subagent-backend` + `subagent-database`.

**Objective:** Mencegah external provider latency memblokir webhook request.

**Files:**
- Inspect/modify: `supabase/functions/mayar-webhook/index.ts`
- Inspect: `supabase/functions/mayar-proxy/`
- Create: additive payment event/job migration jika disetujui
- Create/modify: reconciliation worker/Edge Function
- Test: webhook duplicate, timeout, out-of-order, already-paid, and retry cases

**Langkah:**

1. Pertahankan signature/authentication validation di request boundary.
2. Simpan event dengan idempotency key/provider event identifier.
3. Return success cepat setelah event durable tersimpan.
4. Processor mengambil event secara claimable dan melakukan verification/settlement.
5. Pertahankan settlement RPC dan financial transaction dedupe.
6. Tangani event out-of-order dan provider retry.
7. Jangan mengubah order menjadi cancelled hanya karena response provider sementara gagal.

**Verifikasi:**

- Webhook response tidak menunggu seluruh rangkaian external API.
- Event duplicate hanya diproses satu kali.
- Payment yang sudah paid tidak membuat financial transaction kedua.
- Reconciliation dapat memulihkan event tertunda.

**Gate:** Task ini memerlukan review risiko payment dan approval eksplisit sebelum implementasi production.

---

### Task 9: Load test, failure test, dan regression test

**Profile:** `subagent-qa-tester`.

**Objective:** Membuktikan optimasi tidak hanya terlihat benar dari kode.

**Files:**
- Create/modify: test/load scripts di lokasi QA yang sudah ada
- Artifact: `.qa/performance/` atau lokasi yang disetujui

**Scenario:**

1. Concurrent booking notification workers.
2. Provider timeout dan retry.
3. Mayar duplicate/out-of-order webhook.
4. Burst order status update.
5. Realtime reconnect dan polling fallback.
6. Supervisor restart dengan historical backlog.
7. Stories feed dengan jumlah object berbeda.
8. Payroll/finance transaction integrity regression.

**Output wajib:**

- p50/p95/p99 latency
- throughput
- error rate
- duplicate count
- queue age
- CPU/memory/network impact
- before/after comparison

---

### Task 10: Keputusan apakah Redis/BullMQ diperlukan

**Profile:** `subagent-orchestrator` + code review.

**Objective:** Mengambil keputusan berbasis metrik, bukan asumsi.

**Decision gate:**

Pilih PostgreSQL queue jika:

- workload masih moderate
- job dekat dengan data Supabase
- query/claim masih stabil
- retry sederhana sudah cukup
- jumlah consumer terbatas

Pertimbangkan BullMQ + Redis jika:

- job async menjadi banyak dan heterogen
- delayed retry/backoff kompleks
- worker perlu horizontal scaling cepat
- PostgreSQL queue terbukti menjadi bottleneck
- monitoring job membutuhkan dashboard khusus

Pertimbangkan RabbitMQ jika:

- membutuhkan routing exchange/AMQP lintas banyak service
- consumer acknowledgment dan routing topology menjadi requirement utama

Pertimbangkan Kafka hanya jika:

- event streaming high-volume
- retention dan replay panjang
- banyak consumer independen
- analytics/event platform menjadi kebutuhan utama

**Output:** ADR singkat dengan metrik, biaya operasional, rollback, dan keputusan final.

---

## 4. Dependency dan Integrasi Antar-App

### Dengan `apps/pos` dan `apps/admin`

| Data/event | Sumber | Optimasi |
|---|---|---|
| Order status | `pos.order_status` / public view | Realtime table-specific, debounce reload |
| Orders/payment | `pos.orders`, payment flow | Cursor query, incremental polling |
| Finance progress | `pos.financial_transactions` dan views | Hindari global refresh berulang |
| Inventory | `pos.inventory` views | Realtime hanya untuk consumer yang perlu |

### Dengan bot/agents

| Worker | Existing behavior | Plan integration |
|---|---|---|
| `yumi-supervisor-agent` | Polling 5 detik, dedupe/cursor | Single-flight, interval split, metrics |
| `yumi-ai-bot` | Polling 30 detik | Keep manual/report behavior, measure cycle |
| Finance/Purchasing agents | Python polling/HTTP | Tidak dipindah ke broker tanpa baseline |

### Dengan booking

| Data | Existing source | Plan integration |
|---|---|---|
| Timeline | `pos.booking_timeline_events` | Pertahankan immutable/dedup event |
| Delivery | `pos.booking_notification_deliveries` | Worker claim/complete |
| Reminder | `pos.enqueue_due_booking_reminders()` | Scheduler canonical |

### Dengan Cloudflare Workers

| App | Storage | Plan integration |
|---|---|---|
| Customer Stories | R2 + KV | Metadata index/pagination, R2 media tetap |
| Customer Community | R2 + Supabase REST | Ukur endpoint latency dan pagination |

---

## 5. Risk dan Rollback

| Risiko | Mitigasi | Rollback |
|---|---|---|
| Duplicate payment settlement | Provider event idempotency + settlement RPC | Disable processor, retain durable events |
| Duplicate Telegram/WhatsApp | Unique dedupe key + sent guard | Stop worker, jangan reset sent rows |
| Realtime event terlewat | Polling fallback + cursor reconciliation | Re-enable broader listener |
| Queue backlog | Alert oldest age dan failed count | Scale worker atau pause producer |
| Query index migration lock | `CREATE INDEX CONCURRENTLY` bila sesuai | Stop migration, tidak drop index lama |
| Worker crash | External supervisor + restart policy | Re-run unclaimed/retryable jobs |
| Timezone reminder salah | WIB test matrix | Disable scheduler, queue tetap durable |
| R2 metadata mismatch | Dual-read verification | Revert feed reader, keep media objects |
| Dokumentasi topology stale | Update `PROJECT.md` setelah implementasi verified | Revert docs only, no runtime impact |

---

## 6. Verification Commands

Perubahan code hanya boleh diverifikasi setelah implementasi disetujui:

```bash
cd /opt/djiwatentramapp
bun run check-types
bun run build
```

Untuk fungsi Python yang berubah:

```bash
python3 -m py_compile yumi-supervisor-agent/app.py
python3 -m py_compile yumi-ai-bot/app.py
```

Untuk migration:

```text
1. Review SQL diff.
2. Jalankan pada staging/backup yang disetujui.
3. Query count/index/queue state.
4. Uji rollback strategy.
5. Baru promote production.
```

Verifikasi runtime wajib mencakup API response, queue state, database query result, atau log worker. Build sukses saja tidak cukup.

---

## 7. Wave Planning

### Wave 1 — Baseline dan query evidence

- Task 1: Baseline metrics
- Task 2: Query/index audit

**Gate:** Tidak ada optimasi yang dipilih hanya berdasarkan dugaan.

### Wave 2 — Optimasi non-payment

- Task 3: Realtime granular
- Task 4: Polling optimization
- Task 5: Booking worker
- Task 6: Reminder scheduler
- Task 7: Stories N+1

Task berbeda file dapat paralel, tetapi migration dan worker yang berbagi contract harus direview berurutan.

### Wave 3 — Payment async

- Task 8: Mayar durable event + processor

**Gate:** approval eksplisit karena menyentuh payment lifecycle.

### Wave 4 — Proof and architecture decision

- Task 9: Load/failure/regression test
- Task 10: ADR Redis/BullMQ/RabbitMQ/Kafka

---

## 8. Definition of Done

- [ ] Baseline dan after metrics tersimpan.
- [ ] Tidak ada duplicate order/payment/finance/notification pada test.
- [ ] Booking queue benar-benar diproses worker.
- [ ] Reminder scheduler canonical dan idempotent.
- [ ] Mayar webhook tidak lagi bergantung pada seluruh external call bila Task 8 disetujui.
- [ ] Realtime reload lebih granular.
- [ ] Supervisor polling tidak overlap dan tetap menangkap event baru.
- [ ] Stories feed tidak melakukan N+1 yang tidak diperlukan.
- [ ] Semua test/typecheck/build relevan lulus.
- [ ] Production verification memiliki API/DB/log evidence.
- [ ] `PROJECT.md` diperbarui hanya setelah topology baru benar-benar verified.
- [ ] Tidak ada RabbitMQ/BullMQ/Kafka/Redis ditambahkan tanpa ADR dan metrik pendukung.

---

## 9. Execution Handoff

Plan selesai dan tersimpan. Implementasi belum dilakukan.

Urutan eksekusi yang disarankan: **Wave 1 → review baseline → Wave 2 → payment approval → Wave 3 → Wave 4**. Untuk setiap perubahan gunakan selective git add; jangan memakai `git add -A`.
