# Plan: Pusat Notifikasi POS untuk Order DjiwaApp dan Briefing Admin

## Status

Plan only — belum ada implementasi kode, migration, deploy, atau perubahan runtime.

## Goal

Mengganti tombol `•••` pada header `apps/pos /menu` menjadi **Pusat Notifikasi POS** yang menampilkan:

1. Pesanan baru dari `apps/customer` yang menunggu pembayaran di kasir.
2. Status pembayaran/order DjiwaApp.
3. Informasi operasional dari admin.
4. Briefing shift dari admin.

Pusat notifikasi harus memberi alert yang jelas tanpa memblokir aktivitas kasir.

## Current Context

- Header `apps/pos/src/routes/menu.lazy.tsx` saat ini sudah memiliki tombol `MoreHorizontal` pada area header.
- `apps/pos /menu` sudah mendeteksi order `source = customer_self_service` melalui `useHybridOrders()`.
- `useHybridOrders()` menerima perubahan dari tabel/view `pos_orders` melalui mekanisme realtime/refresh hybrid.
- Suara transaksi sukses saat ini berada di `apps/pos/src/lib/play-success-sound.ts` dan hanya dipicu untuk order DjiwaApp yang berubah menjadi `paid`/`completed`.
- Sidebar order sudah menampilkan label `DjiwaApp` pada card order.
- Flow customer membedakan pembayaran `cashier_pending` dan `mayar_pending`; keduanya tidak boleh diperlakukan sama.
- Pencarian repository menemukan tabel `public.employee_notifications` untuk notifikasi personal karyawan, tetapi belum menemukan kontrak pusat notifikasi POS yang siap dipakai untuk order dan briefing. Karena itu, rencana ini menggunakan tabel notifikasi operasional POS baru, bukan mencampur data dengan notifikasi personal karyawan.

## Business Rules

### Klasifikasi notifikasi order

| Kondisi | Label POS | Suara | Action |
|---|---|---:|---|
| Customer memilih bayar kasir dan order baru masuk | `Bayar di Kasir` | Ya | Buka detail, tandai dibaca, lanjut ke konfirmasi pembayaran |
| Customer membuat invoice QRIS tetapi belum membayar | `Menunggu Pembayaran DjiwaApp` | Tidak wajib | Buka detail/status invoice |
| Order berubah `paid`/`completed` | `Lunas` | Suara sukses yang sudah ada | Buka detail |
| Order `cancelled`/expired | `Dibatalkan` | Tidak | Arsipkan/update status |

Order `pending` tidak boleh langsung diasumsikan harus dibayar di kasir. Filter harus menggunakan payment mode/receipt mode yang eksplisit, misalnya `cashier_pending`, bukan hanya `status = pending`.

### Audio

- Gunakan sound existing `transaction-success.mp3` melalui helper `playSuccessSound()` untuk alert order baru bayar kasir.
- Satu order hanya menghasilkan satu event audio per sesi/browser.
- Initial load tidak membunyikan order lama.
- Refresh realtime tidak boleh menggandakan audio.
- Briefing admin biasa hanya menggunakan badge visual.
- Briefing prioritas tinggi dapat menggunakan sound existing satu kali, dengan cooldown agar tidak mengganggu operasional.
- Audio gagal karena autoplay policy harus ditangani diam-diam dan tetap menampilkan badge/popup visual.

## Alternatives Analysis

### Option A: Notifikasi hanya dari state `pos_orders` di frontend

| Pros | Cons |
|---|---|
| Implementasi cepat | Briefing admin tidak memiliki sumber data yang jelas |
| Tidak perlu tabel baru untuk order | Read/unread dan dedupe mudah hilang saat refresh |
| Memanfaatkan realtime order yang sudah ada | Sulit menargetkan role/cabang/shift |
| | Dua tab POS dapat menampilkan event yang sama |

### Option B: Notification center dengan event order + tabel briefing admin

| Pros | Cons |
|---|---|
| Read/unread, prioritas, target, expiry dapat disimpan | Membutuhkan migration, RLS, dan hook baru |
| Briefing admin dan order memiliki satu UX | Lebih banyak verifikasi backend |
| Dapat mencegah duplicate notification lintas tab/device | Perlu strategi idempotency untuk event order |
| Riwayat briefing dapat diaudit | Ada pekerjaan UI tambahan |

### Recommendation

Pilih **Option B**, dengan aturan bahwa order customer tetap berasal dari `pos_orders` sebagai source of truth. Tabel notification center menyimpan event/notifikasi yang sudah dinormalisasi untuk UI, bukan menggantikan status order.

Alasannya:

1. Status finansial/order tetap authoritative di `pos_orders` dan webhook/payment flow.
2. Briefing admin membutuhkan data durable yang bisa ditargetkan dan ditandai sudah dibaca.
3. Notification center dapat mencegah suara/popup berulang saat POS dibuka di beberapa tab.
4. Riwayat notifikasi admin dapat dipertahankan tanpa mengotori tabel order.

## Proposed Architecture

```text
apps/customer
    │
    ├── create order cashier_pending / mayar_pending
    │
    └── payment webhook → pos.orders paid/completed
                                  │
                                  ▼
                         POS notification adapter
                         ├── derive new order event
                         ├── classify payment mode
                         └── dedupe by order_id + event_type
                                  │
                                  ▼
                         POS Notification Center
                         ├── Bell badge
                         ├── realtime drawer
                         ├── audio policy
                         └── read/acknowledge state

Admin briefing UI/API
    │
    └── pos_notifications / RPC → targeted POS users
```

Order event notification boleh dibuat secara lazy di frontend pada fase pertama, tetapi harus memakai deterministic dedupe key. Untuk briefing admin dan cross-device read state, gunakan persistent table/API.

## Database Schema

Migration harus additive dan idempotent.

### Proposed `public.pos_notifications`

```sql
CREATE TABLE IF NOT EXISTS public.pos_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  title text NOT NULL,
  message text NOT NULL,
  order_source_id text,
  order_number text,
  source text,
  target_branch_id text,
  target_role text,
  target_user_id text,
  dedupe_key text NOT NULL UNIQUE,
  action_type text,
  action_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true
);
```

### Proposed `public.pos_notification_reads`

```sql
CREATE TABLE IF NOT EXISTS public.pos_notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.pos_notifications(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  UNIQUE (notification_id, user_id)
);
```

### Indexes

```sql
CREATE INDEX IF NOT EXISTS pos_notifications_active_created_idx
  ON public.pos_notifications (is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS pos_notifications_target_idx
  ON public.pos_notifications (target_branch_id, target_role, target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pos_notification_reads_user_idx
  ON public.pos_notification_reads (user_id, read_at DESC);
```

### Suggested notification types

```text
order_cashier_pending
order_mayar_pending
order_paid
admin_info
admin_briefing
```

### REST/view mapping

The self-hosted PostgREST API should expose a safe view or RPC rather than unrestricted direct access to the base table:

```text
GET  /rest/v1/pos_notifications
POST /rest/v1/rpc/mark_pos_notification_read
POST /rest/v1/rpc/acknowledge_pos_notification
POST /rest/v1/rpc/create_pos_admin_notification
```

Writes from admin should use an authenticated Edge Function/RPC with role/branch authorization. Do not let the POS browser create arbitrary admin briefings.

### RLS requirements

- POS users can read notifications targeted to their user, role, branch, or global scope.
- POS users can insert only their own read/acknowledge records.
- POS users cannot create, edit, or delete admin notifications.
- Admin can create/update briefing notifications only within authorized branch/scope.
- Service-role/server-side event creation must not be exposed to the browser.
- Notification payload must not contain secrets or unnecessary PII.

## UI/UX Specification

### Header

File target: `apps/pos/src/routes/menu.lazy.tsx` or an extracted shared header component.

Replace the existing `MoreHorizontal` action with:

```text
[ Bell icon ][ unread badge ]
```

Keep a secondary overflow menu only if the existing `•••` action contains unrelated functions that must survive. Do not silently remove those actions; move them into the notification drawer header or a separate overflow button.

### Notification drawer

Recommended width:

- Desktop: 360–420px.
- Mobile/tablet POS: full width or max-width 420px.
- Must be above product content and below any critical system dialog.
- Closing by X, outside click, and Escape.
- Does not block cashier product entry when merely opened.

Drawer structure:

```text
Header: Notifikasi + unread count + tandai semua dibaca
Tabs: Semua | Pesanan | Admin
List: newest first
Footer: Lihat semua / filter active
```

### Notification card: cashier order

```text
[Wallet icon] Pesanan baru — Bayar di Kasir
DJW-260821-0042 · DjiwaApp
Fakhri · 3 item · Rp85.000
Baru saja
[Buka Detail]
```

- Amber surface for unread cashier payment.
- Red/amber dot for urgent unread state.
- Keep source `DjiwaApp` visible.
- Detail action navigates/open existing order detail rather than duplicating order logic.
- Payment confirmation remains a deliberate action; opening the notification must not mark the order paid.

### Notification card: admin briefing

```text
[ Megaphone icon ] Briefing Shift Sore
Pastikan stok bar dicek sebelum pukul 17:00.
Admin · 10 menit lalu
[Saya sudah membaca]
```

- Blue or violet surface for normal briefing.
- Amber/red only for priority high.
- Acknowledge button is separate from read state when the admin requires confirmation.

### States

- Loading: skeleton rows in the drawer.
- Empty: `Belum ada notifikasi` with separate empty copy per tab.
- Error: inline error + retry; do not hide the Bell icon.
- Unread: badge and stronger card contrast.
- Read: reduced contrast but still accessible.
- Saving read/acknowledge: optimistic state with rollback on failure.
- Expired: remove from active list but retain audit history where appropriate.
- Audio blocked: visual notification continues; no user-facing error toast.

### Existing order card

Keep a compact `DjiwaApp` source label on the order card for source transparency. The notification center is the alert surface, not the only source label.

## Backend and Event Strategy

### Phase 1: Safe frontend-derived order events

- Continue reading `pos_orders` via `useHybridOrders()`.
- Derive only eligible customer order states:
  - new `cashier_pending` order;
  - transition to `paid`/`completed`.
- Use dedupe key:

```text
order:{order_source_id}:cashier_pending
order:{order_source_id}:paid
```

- Keep in-memory ref for current session plus persisted read state for cross-refresh.
- Do not modify financial status from the notification UI.

### Phase 2: Durable event creation

Create order notification events server-side from the authoritative settlement/order path or an idempotent worker/RPC.

Requirements:

- One event per `dedupe_key`.
- Duplicate webhook/order updates are no-op.
- Pending order notifications do not trigger financial or Telegram side effects.
- Payment success remains governed by Mayar/webhook verification.

### Admin briefing flow

1. Admin selects target scope: all POS, branch, role, shift, or specific user.
2. Admin enters title, message, priority, optional expiry, and optional acknowledgement requirement.
3. Server validates authorization and inserts with deterministic ID.
4. POS receives the event through realtime.
5. POS displays badge/drawer; high-priority briefing may play one controlled sound.
6. Read/acknowledge state is written separately.

## Files Likely to Change

### Frontend POS

- `apps/pos/src/routes/menu.lazy.tsx`
  - Replace header action with Bell/unread badge.
  - Mount notification drawer and order event adapter.
  - Preserve unrelated `MoreHorizontal` actions if needed.
- `apps/pos/src/components/pos/notification-center.tsx` (new)
  - Drawer, tabs, list, card states, read/acknowledge actions.
- `apps/pos/src/hooks/use-pos-notifications.ts` (new)
  - Fetch/realtime subscription, filtering, dedupe, unread count.
- `apps/pos/src/lib/pos-notification-policy.ts` (new)
  - Classify cashier vs Mayar pending, priority, audio eligibility.
- `apps/pos/src/lib/play-success-sound.ts` (existing)
  - Reuse `playSuccessSound()` for cashier-order alerts and optional urgent briefing alerts.
  - Add only dedupe/cooldown orchestration around the existing helper; do not create a second audio helper unless implementation discovery proves it necessary.
- `apps/pos/src/components/pos/menu-sidebar.tsx`
  - Only if card status/source display needs a small consistency update.

### Database/backend

- `supabase/migrations/<timestamp>_pos_notification_center.sql` (new)
- `supabase/functions/pos-notifications/index.ts` (new or existing admin notification function after discovery)
- Optional safe view/RPC migration files for read/acknowledge and scoped listing.

### Admin

- Existing admin notification/operational page must be identified before implementation.
- If no suitable admin surface exists, add a small admin-only briefing composer rather than exposing the feature in POS.
- Likely files depend on the existing admin route/navigation pattern and must be confirmed before coding.

### Shared types

- `packages/yumipos-web-shared/src/types/*` or existing POS type location, only if notification contracts are shared by Admin/POS.

## Integration Points

### Customer app

- Preserve `source = customer_self_service`.
- Preserve payment mode distinction (`cashier_pending` vs `mayar_pending`).
- Do not change checkout totals or payment behavior merely to add notification.

### Mayar/payment

- `paid` notification only after verified settlement.
- Browser redirect/invoice creation is not proof of payment.
- Notification event must not replace webhook verification or reconciliation.

### Telegram/bots

- No Telegram notification is required for the POS bell feature by default.
- Existing Telegram order notifications must remain independent and deduplicated.
- If briefing should also reach Telegram later, add an explicit channel preference rather than coupling POS read state to Telegram delivery.

### Purchasing/AI agents

- No direct AI/purchasing integration in phase 1.
- Future stock/briefing events can publish typed notification events, but they must use the same dedupe and authorization contract.

## Multi-Source Data Flow

```text
Customer checkout
  → pos.orders (source/payment/status)
  → useHybridOrders / realtime
  → notification policy
  → POS notification center + sound

Mayar webhook
  → verified transaction
  → pos.orders paid/completed
  → existing financial transaction path
  → order_paid notification

Admin briefing composer
  → authorized RPC/Edge Function
  → pos_notifications
  → realtime POS drawer
  → pos_notification_reads
```

The notification center is a presentation and acknowledgement layer. It must never become the source of truth for payment, inventory, order status, or financial reporting.

## No-Hardcode Audit

Values that must not be hardcoded:

- Branch scope.
- Role targets.
- Admin identity.
- Notification title/message/briefing content.
- Order total, customer name, order number, payment mode.
- Notification expiry and priority policy, if admin-configurable.
- Audio file URL should be an app asset/config constant, not a remote secret URL.

Allowed constants:

- Notification type enum.
- Dedupe key format.
- Default drawer size/design tokens.
- Safe audio cooldown and autoplay fallback behavior.

## Implementation Waves

### Wave 1 — Contract and data audit

1. Confirm exact `pos_orders` fields for `source`, payment mode, status, order number, customer, and total.
2. Confirm existing admin route where briefings should be authored.
3. Confirm active realtime table/view names and RLS behavior.
4. Define TypeScript notification contract and cashier/mayar classification.

### Wave 2 — Database/backend foundation

1. Add additive notification and read tables.
2. Add indexes, RLS, scoped read RPC, read/acknowledge RPC.
3. Add idempotent admin briefing creation path.
4. Add server-side order event creation only after the order/payment contract is verified.

### Wave 3 — POS notification UI

1. Replace header action with Bell and unread badge.
2. Build drawer with tabs and state handling.
3. Add order notification cards and detail navigation.
4. Add admin briefing cards and acknowledgement.
5. Preserve existing order sidebar/source label.

### Wave 4 — Audio and dedupe

1. Reuse existing `playSuccessSound()` and `transaction-success.mp3`; do not add a new audio asset.
2. Implement one-sound-per-event policy around the existing helper.
3. Handle initial load, refresh, multiple tabs, autoplay blocking, and rapid burst events.
4. Add visual fallback when audio cannot play.

### Wave 5 — Verification and rollout

1. Run unit tests for classification/dedupe/audio eligibility.
2. Run migration/RLS tests with cashier, admin, wrong branch, and wrong role.
3. Test customer cashier order → POS notification → manual payment confirmation.
4. Test customer Mayar pending order → no cashier alert.
5. Test paid/completed transition → success sound once.
6. Test admin briefing delivery, read, acknowledge, expiry, and targeting.
7. Build POS with `TMPDIR=/opt/djiwatentramapp/.tmp`.
8. Capture browser screenshots at desktop and POS tablet widths.
9. Deploy only approved app/function/migration scope and run live smoke tests.

## Verification Matrix

| Scenario | Expected result |
|---|---|
| Initial `/menu` load with old cashier-pending order | Visible according to active filter, no sound replay |
| New customer cashier order | Bell badge increments, drawer item appears, cashier sound once |
| Same order realtime update repeated | No duplicate item/sound |
| Customer Mayar invoice unpaid | Shown as DjiwaApp pending if configured, no cashier-payment sound |
| Customer order paid/completed | Success sound once and status updates |
| Order cancelled | Notification updates/removes from active queue |
| Admin normal info | Bell badge/drawer, no sound |
| Admin urgent briefing | Priority styling and optional one-time sound |
| Two POS tabs | No duplicate persistent events; defined tab sound policy |
| Cashier opens notification | Read state changes; order is not marked paid automatically |
| Cashier confirms payment | Existing payment/order flow updates status; notification changes to paid |
| Wrong branch/role | Notification not visible |
| RLS unauthorized write | Rejected |
| Realtime disconnect | Existing list remains usable; retry/reconnect state shown |

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| All `pending` orders incorrectly treated as cashier payment | Require explicit cashier payment mode/receipt mode |
| Duplicate sound from realtime refresh | Deterministic event key + current status ref + persistent read state |
| Notification drawer blocks cashier workflow | Use non-blocking right drawer and keep product grid usable |
| Autoplay blocked | Sound is best-effort; badge/drawer is authoritative UX |
| Admin briefing leaks across branches | Server-side target filtering and RLS, not frontend-only filtering |
| Notification UI changes payment state accidentally | Read/acknowledge actions separated from payment confirmation |
| New notification table drifts from order truth | Keep order/payment status authoritative in `pos_orders` and verified webhook |
| Existing `•••` functions disappear | Inventory button actions before implementation and preserve/move them explicitly |
| Too many sounds during busy shift | Priority/cooldown/burst aggregation policy |

## Open Questions Before Implementation

1. Apakah briefing admin dibuat dari halaman Admin baru, atau sudah ada halaman operasional yang ingin dipakai?
2. Apakah notifikasi harus ditargetkan per cabang dan role, atau cukup semua user POS pada fase pertama?
3. Untuk order `cashier_pending`, apakah kasir boleh menekan `Tandai Sudah Dibayar` langsung di drawer, atau wajib membuka detail order terlebih dahulu?
4. Apakah briefing prioritas tinggi memang perlu suara, atau semua briefing cukup badge visual?
5. Apakah tombol `•••` saat ini memiliki fungsi lain yang wajib tetap tersedia setelah diganti Bell?

## Definition of Done

- Bell notification center tersedia di `/menu` tanpa menghilangkan fungsi header lama.
- Order customer yang benar-benar `cashier_pending` memicu notifikasi visual dan suara satu kali.
- `mayar_pending` tidak salah dilabeli sebagai pembayaran kasir.
- Admin dapat mengirim info/briefing dengan target yang sah.
- Read/acknowledge state durable dan aman melalui RLS/RPC.
- Payment state tetap hanya berubah melalui flow pembayaran yang sah.
- Build, migration/RLS test, realtime test, audio test, dan browser preview berhasil.
- Tidak ada deploy atau perubahan database dilakukan sebelum plan ini disetujui.
