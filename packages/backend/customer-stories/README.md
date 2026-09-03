# Customer Stories Worker/R2 backend integration

Status: **Worker deployed and bound to R2 + KV**. Dedicated Worker source berada di `workers/customer-stories/`; konfigurasi Pages utama tidak diubah. Auth menggunakan introspeksi Better Auth di `AUTH_ORIGIN` dan fail-closed jika sesi tidak valid.

## Audit result and deployment

- `/opt/djiwatentramapp/wrangler.toml` is a Cloudflare **Pages** configuration only:
  `pages_build_output_dir = "apps/web/dist"`.
- Dedicated Worker entrypoint is `workers/customer-stories/src/index.ts`, with separate `workers/customer-stories/wrangler.toml`.
- R2 binding `STORIES_BUCKET` targets `djiwa-customer-stories`; KV binding `CUSTOMER_STORIES_KV` stores minimal moderation state.
- Customer and Merchandise origins are explicitly allowed for credentialed CORS.
- Customer authentication is Better Auth on the Node/Bun VPS service at `https://djiwatentram.yumme.id/api/auth`, with an HttpOnly cross-subdomain cookie. The Worker introspects the session through `AUTH_ORIGIN` and fails closed when unavailable.
- `apps/auth-server/.env` contains secrets and is not read or copied into Worker configuration.
- Existing Supabase Edge Functions are a different deployment/runtime and do not provide an R2 binding or signed-URL contract.

**Decision:** dedicated Worker + R2 + KV sudah aktif. Tidak ada PostgreSQL migration dan tidak ada filesystem VPS untuk binary Story. CORS production mencakup Customer dan Merchandise; batas foto/video, expiry 24 jam, owner-only delete, report, dan block ditegakkan Worker.

## Proposed deployment boundary

Create a dedicated Worker project/config in a later change, separate from the Pages config, for example:

```text
packages/backend/customer-stories-worker/
  src/index.ts
  wrangler.toml       # dedicated config; do not merge into root Pages config
```

Required non-secret bindings/configuration:

```toml
# Dedicated Worker config, illustrative only; not active.
name = "<approved-worker-name>"
main = "src/index.ts"
compatibility_date = "<approved-date>"

[[r2_buckets]]
binding = "STORIES_BUCKET"
bucket_name = "<approved-r2-bucket>"
```

The implementation must use a server-side signing mechanism for upload URLs. If AWS-compatible R2 S3 signing is selected, its access key and secret must be Worker secrets (never committed); if an approved upload-token service is selected, its endpoint/auth contract must be documented first. A plain public R2 URL is not acceptable.

## Required auth decision before coding

Choose and document one verifiable option:

1. **Worker-side Better Auth introspection:** an authenticated internal endpoint that accepts the incoming session cookie and returns only a stable customer identifier, with origin/service authentication and timeout behavior; or
2. **Worker-verifiable signed identity token:** a documented JWT/opaque bearer-token format, issuer, audience, key discovery/rotation, and revocation/session-expiry rules that the Worker can verify without guessing.

The Worker must fail closed when auth validation is unavailable. It must not decode an unsigned cookie, trust a client-supplied `ownerSourceId`, or use a Supabase anon key as customer identity.

## API contract to implement after unblock

All responses use exactly this envelope shape:

```json
{ "data": {}, "error": "optional-safe-message", "details": {} }
```

`details` must not contain tokens, object keys belonging to another owner, stack traces, or PII beyond the approved display identifier.

### `POST /stories/upload-url`

Auth: approved customer session/token. Request JSON:

```json
{
  "mediaType": "image|video",
  "contentType": "image/webp|image/jpeg|image/png|video/mp4|video/webm",
  "sizeBytes": 123456,
  "durationSeconds": 12.5,
  "extension": "webp"
}
```

Validation requirements:

- reject unknown fields if the chosen schema policy is strict;
- allow only the approved image/video MIME allowlist;
- require an integer `sizeBytes` greater than zero and within the configured limit;
- require `durationSeconds` for video, reject non-finite/negative values and values over **15 seconds**;
- reject duration for images unless the final schema explicitly permits it;
- validate extension against MIME and normalize it server-side;
- generate opaque `storyId`, `createdAt`, and `expiresAt = createdAt + 24h` from server time;
- derive the owner only from validated auth;
- return a short-lived signed upload URL and the upload contract. Never accept client `createdAt` or `expiresAt`.

Expected success preview (shape only; values are placeholders, not a live response):

```json
{
  "data": {
    "storyId": "opaque-story-id",
    "uploadUrl": "https://<approved-signed-upload-endpoint>",
    "objectKey": "opaque-upload-reference",
    "createdAt": "2026-09-04T00:00:00.000Z",
    "expiresAt": "2026-09-05T00:00:00.000Z",
    "mediaType": "image",
    "contentType": "image/webp"
  }
}
```

### `GET /stories`

Auth: approved logged-in customer. List only active objects with `expiresAt > serverNow`, bounded and ordered newest-first. Return summaries only; do not expose R2 listing internals or unapproved PII. The owner's latest story must be orderable first by the client contract, but ordering must not trust a client-provided owner flag.

### `GET /stories/{storyId}/media`

Auth: approved logged-in customer. Resolve the opaque ID through the approved metadata/index strategy, re-check expiry using server time, then stream media only through the authenticated Worker response. Use a short cache lifetime; never serve an expired object merely because a browser retained an old URL.

### `DELETE /stories/{storyId}`

Auth: approved logged-in customer. Resolve metadata, compare the authenticated owner to stored `ownerSourceId`, and delete only the matching object. Missing/expired objects should return a safe idempotent result or documented `404`; a non-owner must never learn whether another owner's opaque ID exists.

## R2 object and metadata contract

Recommended key:

```text
stories/{ownerSourceId}/{storyId}/{createdAt}-{expiresAt}.{extension}
```

Use an opaque, validated owner identifier only. Store no name, email, phone, balance, order, or other profile data in object metadata. Minimum metadata:

```json
{
  "storyId": "opaque-id",
  "ownerSourceId": "approved-stable-customer-id",
  "createdAt": "ISO-8601",
  "expiresAt": "ISO-8601",
  "mediaType": "image|video",
  "contentType": "approved-content-type"
}
```

R2 lifecycle expiration is only physical-cleanup safety net. Feed and media handlers must enforce expiry synchronously. If R2 list performance or report/block is needed, approve a minimal KV index separately; do not add PostgreSQL tables or columns for Stories.

## CORS and security contract

- Handle `OPTIONS` on every Story route.
- Allow only the approved Customer origin(s), not `*` when credentials/cookies are used.
- Allow `Content-Type`, `Authorization`, and the exact auth/plugin headers required by the verified auth flow (currently the Better Auth client may use `X-Visitor-Id` and `X-Request-Id`).
- Set `Access-Control-Allow-Credentials: true` only with an explicit origin.
- Add `Vary: Origin`.
- Do not log cookies, bearer tokens, signed URLs, or full object keys.
- Add a server-side rate limit for upload URL issuance and delete/media access.
- Set explicit upload URL expiry shorter than Story lifetime.

## Static curl contract preview (not live deployment)

After an approved Worker URL and auth contract exist, these are the minimum smoke checks. They are intentionally not runnable against this repository today:

```bash
BASE_URL="https://<approved-story-worker>"

# CORS preflight
curl -i -X OPTIONS "$BASE_URL/stories" \
  -H 'Origin: https://djiwatentram.yumme.id' \
  -H 'Access-Control-Request-Method: GET'

# Feed (must fail closed without the approved auth credential)
curl -i "$BASE_URL/stories" \
  -H 'Origin: https://djiwatentram.yumme.id' \
  -H 'Accept: application/json'

# Invalid upload (must be 400; server expiry must not be client-controlled)
curl -i -X POST "$BASE_URL/stories/upload-url" \
  -H 'Origin: https://djiwatentram.yumme.id' \
  -H 'Content-Type: application/json' \
  --data '{"mediaType":"video","contentType":"video/mp4","sizeBytes":1,"durationSeconds":15.01,"extension":"mp4"}'
```

Do not report these commands as successful endpoint calls until a dedicated Worker is deployed and each response is read back.

## Unblock checklist

- [ ] Name/domain and separate Worker deployment owner approved.
- [ ] R2 bucket and lifecycle policy approved; binding and non-secret config supplied.
- [ ] Upload signing mechanism approved; secrets provisioned out-of-band.
- [ ] Better Auth session introspection or verifiable token contract implemented and tested.
- [ ] Exact production/preview CORS origins approved.
- [ ] Final photo/video byte limits approved (the plan specifies 15 seconds but not byte limits).
- [ ] Rate-limit policy and optional KV index/report/block scope approved.
- [ ] Worker unit tests cover expiry boundary, MIME/size/duration validation, owner-only delete, CORS, and generic internal errors.
