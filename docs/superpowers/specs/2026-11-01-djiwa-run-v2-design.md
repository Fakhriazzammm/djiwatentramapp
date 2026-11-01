# Djiwa Run v2 — Design

Status: implementation on branch `feat/djiwa-run-v2`. Not deployed.

## Goals
GPS-first run tracking in the browser with manual (screenshot) fallback, saldo Djiwa Pay rewards,
streak, leaderboard, team challenge, share to Komunitas.

## Flow
1. `start_session` — server creates a `pos.run_sessions` row with server `started_at`.
2. Browser samples `watchPosition` (Wake Lock when available) and buffers points locally.
3. `finish_session` — client uploads points; **server recomputes distance/pace and validates**. Client totals are never trusted.
4. Result: `accepted` (auto) or `review` (admin) or `rejected`. GPS unavailable/denied → manual screenshot flow (existing OCR path, unchanged rules).

## Validation rules (server, GPS session)
| Rule | Value |
|---|---|
| Point accuracy | ≤ 50 m, else dropped |
| Gap between points | > 60 s breaks the segment (no interpolation) |
| Segment speed | ≤ 7 m/s running, ≤ 3 m/s walking; faster → flag `SPEED` |
| Avg pace | running 3:00–15:00 /km; walking 6:00–20:00 /km, else `PACE` |
| Duration | 3 min – 4 h, and ≤ server elapsed + 30 s (`TIME_SPOOF`) |
| Distance | 0.3 km – 42 km per session |
| Valid-point coverage | ≥ 80 % of expected samples |
| Timestamps | strictly increasing, inside [started_at, server now + 30 s] |
| Daily cap | ≤ 3 sessions and ≤ 15 km credited/day |
| Overlap | session may not overlap another session of the same customer |
| Teleport | any jump > 200 m in ≤ 2 s → `TELEPORT` |

Zero flags and trust ≥ threshold → `accepted`; any flag → `review`; hard violations (overlap, caps, bad timestamps) → `rejected`.
Manual/screenshot activities always keep their existing validation and may only be auto-accepted by existing rules.

## Rewards (saldo Djiwa Pay)
- `run_tiers.reward_config = {"type":"wallet","amount": <IDR>}`; no hard-coded amount.
- Credited once per (customer, campaign, tier) when the tier completes from **accepted** activity,
  via `pos.customer_wallet_ledger` with idempotency key `run-reward:<reward_id>`.
- Rewards from `review` activity are only granted after admin accepts.
- Existing product-restricted rewards keep working.

## Social
- Streak: consecutive days with ≥ 1 accepted activity (Asia/Jakarta).
- Leaderboard: per campaign, week/month, public display = first name + initial only.
- Team challenge: teams + members, team distance = sum of accepted member km in campaign.
- Share: composes a Komunitas post draft from an accepted activity (no GPS route published).

## Privacy
Raw tracks are private to the owner and admins; leaderboards expose only first name and distance.
