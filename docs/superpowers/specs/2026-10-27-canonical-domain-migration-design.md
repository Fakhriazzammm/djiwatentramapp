# Canonical Domain Migration Design

## Intent

Ensure every active app endpoint, inter-app link, deployment target, operational job, and generated frontend bundle uses the canonical `djiwatentram.web.id` domain family. Prevent the login failure caused by production bundles calling unavailable `*.yumme.id` hosts.

## Goals

- Use `api.djiwatentram.web.id` for auth and customer APIs.
- Use `supabase.djiwatentram.web.id` for Supabase REST, storage, and Edge Functions.
- Use the canonical app subdomains for cross-app links and deploy targets.
- Add an automated contract test that rejects legacy active endpoints.
- Preserve legacy domains only where they are explicitly needed for migration compatibility: trusted auth origins, legacy storage URL normalization, and historical test fixtures.

## Non-goals

- Do not change database schema, RLS, or Supabase data.
- Do not delete legacy DNS or revoke existing sessions.
- Do not rewrite the unrelated `yumme.id` marketing app or brand email addresses.

## Approach

The chosen approach is a minimal-diff canonical migration: replace active runtime/deployment references, keep narrowly scoped compatibility allowlists, rebuild affected frontend apps, and verify both source and emitted bundles. A hard removal of every legacy string was rejected because it would break storage migration and existing trusted-origin compatibility.

## Verification

The canonical-domain contract test must pass, affected app builds must complete, emitted `dist` bundles must contain no legacy active endpoints, and canonical auth/Supabase hosts must respond from production.
