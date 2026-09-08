# ADR: Asynchronous Processing Baseline

Date: 2026-09-09
Status: Accepted for the current rollout; payment processor remains gated

## Decision

Keep Supabase PostgreSQL as the source of truth and use database-backed queues with `FOR UPDATE SKIP LOCKED`, idempotency keys, retry state, and terminal failure state. Do not add RabbitMQ, BullMQ, Kafka, or Redis in this rollout.

## Evidence

- Booking notification queue and claim/complete RPCs already exist in `pos.booking_notification_deliveries`.
- A standalone booking worker now has a provider interface, dry-run adapter, bounded retry, safe worker identity, and terminal failure handling.
- Supervisor and General Manager polling are split by domain with single-flight locks while preserving the established order cadence.
- Realtime listeners are narrowed to source tables in the affected admin/POS hooks; polling remains as fallback.
- Customer Stories R2 listing no longer performs one R2 `get()` per listed object; metadata is requested in the listing operation.
- Runtime metrics and live p95/queue-depth numbers still require access to the production observability/database environment; no numbers are fabricated here.

## Broker decision gate

Reconsider Redis/BullMQ/RabbitMQ/Kafka only if measured evidence shows one or more of:

1. PostgreSQL queue lock contention or sustained backlog under the documented load test.
2. Delayed retry/backoff requirements that cannot be represented safely by the existing durable queue.
3. A need for high-volume heterogeneous jobs with independent horizontal worker scaling.
4. Operational metrics proving that broker overhead is lower than the current database-backed design.

## Payment safety gate

Mayar settlement must not be declared complete until the durable event, provider verification, duplicate event handling, and exactly-one financial transaction are tested together. Production migration/deployment is intentionally excluded from this ADR execution.

## Rollback

Stop the new worker/scheduler or disable the processor; do not delete queue rows, reset `sent` rows, or rewrite historical payment/finance records. Re-enable the existing polling/reconciliation fallback while investigating.
