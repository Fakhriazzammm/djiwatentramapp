# IAK PPOB Expansion Design

Date: 2026-10-23
Status: Design approved in chat; awaiting written-spec review
Scope: Djiwa Pay prepaid v2 compatibility and postpaid inquiry/payment foundation

## Context

`apps/djiwapay` already consumes a server-side IAK proxy for prepaid price lists and top-up transactions. The current Edge Function supports balance, price list, top-up, and signed prepaid callbacks. The customer UI already contains categories for prepaid and postpaid-like services, but the backend contract treats them as a single prepaid product flow.

IAK documents two materially different transaction models:

- Prepaid is asynchronous. A top-up starts in process/pending and reaches success or failed through callback or status polling.
- Postpaid requires an inquiry before payment. Inquiry returns bill identity and amount; payment is a separate provider operation.

The implementation must preserve wallet accounting invariants: a provider process response is never treated as success, a wallet hold is captured only after provider success, and a failed/expired transaction releases the hold exactly once.

## Goals

1. Normalize IAK prepaid v2 calls behind the existing Supabase Edge Function.
2. Add a generic postpaid inquiry/payment/status contract that can support PLN, PDAM, BPJS, TV, multifinance, internet, gas, PBB, tax, insurance, and employment BPJS.
3. Keep provider credentials and signing server-side.
4. Make every provider request idempotent and recoverable through callback or status reconciliation.
5. Give Djiwa Pay a clear inquiry-first checkout flow without breaking the current prepaid checkout routes.

## Non-goals

- No direct IAK calls from the browser.
- No automatic enabling of a category when its IAK product code or production credential is not configured.
- No interpretation of provider `PROCESS` as a settled transaction.
- No new payout/withdrawal provider integration.
- No migration of existing Mayar top-up behavior.

## Proposed architecture

```text
Djiwa Pay UI
  -> auth-server pay bridge (session, customer ownership, wallet hold)
  -> Supabase Edge Function iak-ppob (provider credentials, signatures, IAK calls)
  -> IAK prepaid or postpaid API
  -> callback/check-status reconciliation
  -> pos.ppob_transactions + wallet hold settlement
```

The auth server remains the customer-facing boundary. The Edge Function remains the only component that knows `IAK_USERNAME`, `IAK_API_KEY`, provider base URLs, and callback verification details.

### Provider adapter

Add a small internal adapter in the Edge Function with explicit operations:

- `getPrepaidPriceList(type?, operator?, status)`
- `prepaidTopUp(refId, customerId, productCode)`
- `prepaidCheckStatus(refId)`
- `getPostpaidPriceList(type?, province?)`
- `postpaidInquiry(serviceType, productCode, customerNumber, refId)`
- `postpaidPayment(serviceType, productCode, customerNumber, refId, amount)`
- `postpaidCheckStatus(serviceType, refId)`

The adapter maps IAK v2 fields into an internal response shape and retains the raw provider payload in the transaction record for reconciliation. Product-specific request fields remain in a service definition map rather than being assembled in React.

### Database model

Extend `pos.ppob_transactions` without breaking existing rows:

- `service_kind`: `prepaid` or `postpaid`
- `service_type`: normalized category such as `pulsa`, `pln`, `pdam`, `bpjs`
- `customer_source_id`: Djiwa Pay customer owning the transaction
- `customer_number`: masked in customer-facing responses, full value server-side only
- `inquiry_payload`: JSONB, nullable
- `bill_amount`, `admin_fee`, `total_amount`: numeric amounts for postpaid
- `wallet_hold_id`: reference to the wallet hold
- `payment_status`: internal `unpaid`, `held`, `submitted`, `pending`, `success`, `failed`, `expired`
- `provider_status`, `provider_updated_at`: raw normalized provider state
- `last_error_code`: safe provider/application error code

Keep the existing `status` column for compatibility with the current prepaid callback and map it to the new internal status. Add indexes on customer, ref id, and pending provider status. Do not expose `inquiry_payload` or raw provider payload directly to the browser.

### Wallet settlement

For wallet payments:

1. Create the transaction with a deterministic `ref_id` and idempotency key.
2. Call `pos.wallet_create_hold` using a PPOB-specific order/reference id.
3. Submit the provider request exactly once per idempotency key.
4. On provider success, call `pos.wallet_capture_hold`.
5. On definitive failure or expiry, call `pos.wallet_release_hold`.
6. On provider process/pending or timeout, leave the hold held and expose a pending status.

All capture/release calls are idempotent and must be safe to repeat from callback, polling, or a retry worker.

## API contracts

### Edge Function actions

The existing action endpoint remains POST-only. New actions return a stable envelope:

```json
{ "success": true, "data": {}, "error": null }
```

Required actions:

- `price-list` with `kind: prepaid|postpaid`, optional `type`, `operator`, and `province`.
- `inquiry` with `kind: postpaid`, `serviceType`, `productCode`, `customerNumber`, and `refId`.
- `top-up` with `kind: prepaid`, `refId`, `customerId`, and `productCode`.
- `payment` with `kind: postpaid`, `refId`, `serviceType`, `productCode`, `customerNumber`, and inquiry total.
- `check-status` with `kind`, `refId`, and service type where required.

Validation rejects unknown service types, malformed customer numbers, mismatched inquiry totals, duplicate ref ids with conflicting payloads, and requests when IAK secrets are not configured.

### Auth-server pay bridge

Add authenticated routes for:

- postpaid inquiry
- postpaid wallet payment
- prepaid/postpaid status

The bridge verifies the customer session, never accepts an amount as authoritative for postpaid payment, and reloads the stored inquiry before creating the wallet hold. Responses contain only safe display fields: customer display name, bill period, amount, admin fee, total, status, ref id, serial number, and message.

## Customer flow

### Prepaid

Keep the existing route structure and checkout layout. Replace the provider implementation behind the adapter with v2 field normalization. The UI continues to show pending until callback/status returns success or failed.

### Postpaid

```text
/ppob/{service}
  -> select provider/product
  -> /detail: enter customer number
  -> /inquiry: validate and fetch bill
  -> /konfirmasi: payment method and total
  -> /status: pending/success/failed
  -> /struk: receipt after success
```

The first production category should be PLN and PDAM because both have clear inquiry/payment contracts and already exist in the UI vocabulary. The same contract then enables BPJS, TV, multifinance, and the remaining service definitions without changing wallet settlement rules.

## Error and recovery rules

- `IAK_NOT_CONFIGURED`: show service unavailable; do not create a hold.
- Inquiry failure: no hold is created.
- Insufficient wallet balance: show top-up action; no provider call.
- Provider timeout after hold: leave transaction pending and make status polling available.
- Provider failed: release hold and retain safe failure reason.
- Callback signature mismatch: reject and do not mutate transaction state.
- Duplicate callback or payment request: return the stored transaction state.
- Conflicting reuse of a `ref_id`: reject as an idempotency conflict.

## Security and operations

- Store IAK credentials in Supabase Edge Function secrets only.
- Keep production source IP allowlisting documented and configured outside the repository.
- Validate IAK callback MD5 signature before any database update.
- Redact API key, account balance where unnecessary, PIN, activation code, and full customer number from logs.
- Add metrics/log fields for `ref_id`, service type, provider status, and settlement result.
- Add a reconciliation command or scheduled function for transactions stuck in `pending`.

## Testing and rollout

Tests must cover:

- IAK v2 signing and request mapping.
- prepaid status mapping: process, success, failed.
- callback signature acceptance/rejection and idempotent upsert.
- postpaid inquiry normalization for PLN and PDAM.
- mismatch between stored inquiry total and payment request.
- wallet hold capture/release exactly once.
- timeout/pending recovery.
- customer-facing redaction and route restoration.

Rollout order:

1. Add migration and adapter tests with provider fixtures.
2. Deploy Edge Function and auth bridge with feature flags disabled.
3. Configure sandbox credentials and verify IAK sandbox cases.
4. Enable PLN and PDAM for internal testing.
5. Verify callback and reconciliation behavior.
6. Enable additional categories one by one.

Production activation requires IAK production username/API key and the VPS/Supabase callback and IP allowlist to be configured. Code deployment alone must not enable real transactions without those secrets.

## Acceptance criteria

- Existing prepaid tests and routes remain green.
- PLN and PDAM can complete inquiry, confirmation, payment, pending, success, and failed flows in sandbox fixtures.
- No payment can capture a wallet hold without a provider success response.
- Repeated requests/callbacks do not double-charge or double-release.
- No provider credential or sensitive raw payload reaches the browser or logs.
- Missing IAK secrets result in a safe unavailable response.
- The feature is deployed only after migration, tests, typecheck, build, and endpoint smoke tests pass.
