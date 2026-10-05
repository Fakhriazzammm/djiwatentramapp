# employee-onboarding-api

Server-side boundary for public employee onboarding. Frontend callers are intentionally not migrated in this change.

## Endpoint

`POST /functions/v1/employee-onboarding-api`

All responses are JSON:

- Success: `{ "success": true, "data": ... }`
- Error: `{ "success": false, "error": { "code": string, "message": string } }`

CORS preflight is `OPTIONS` and returns HTTP 200.

## Public actions

### `register`

Request body (only these fields are accepted):

```json
{
  "action": "register",
  "fullName": "Ayu",
  "email": "ayu@example.com",
  "phone": "0812...",
  "identityNumber": "...",
  "address": "...",
  "birthDate": "2000-01-31",
  "birthPlace": "Bandung",
  "emergencyContact": { "name": "...", "phone": "...", "relationship": "..." },
  "employment": { "roleId": "...", "roleName": "STAFF", "employmentType": "full_time", "slug": "ayu", "jabatan": "..." },
  "contract": { "title": "...", "templateUsed": "...", "agreedAt": "..." },
  "attachments": { "cvUrl": "https://...", "photoUrl": "https://..." },
  "registrationNumber": "optional-client-compatible-value"
}
```

The server inserts `status: pending`, generates an opaque token, stores only its SHA-256 hash plus expiry in `raw`, and returns:

```json
{ "applicantToken": "opaque-token", "expiresAt": "...", "application": { "id": "...", "registrationNumber": "...", "status": "pending", "...": "minimal allowlisted fields" } }
```

Passwords, PINs, arbitrary `raw`, signatures, and arbitrary attachment fields are rejected and never written by this function.

### `status`

Request: `{ "action": "status", "applicantToken": "..." }`

Returns only the allowlisted application summary and contract metadata. The token is sent in the JSON body for this pre-authenticated applicant flow; it is never accepted as a registration number.

### `sign_contract`

Request:

```json
{
  "action": "sign_contract",
  "applicantToken": "...",
  "signatureUrl": "https://...",
  "contractPdfUrl": "https://..."
}
```

The token must be unexpired and the application must be `pending` or `approved`. The function sets signature URL, optional PDF URL, `contract_status: signed`, and the employee signing timestamp. URLs must be HTTPS.

## Admin actions

Admin actions require `Authorization: Bearer <Yumi session token>`. The function resolves that session server-side through `yumi_sessions`, checks the active `yumi_users` record, and requires role name `admin`, `administrator`, `owner`, `superadmin`, `super admin`, or permission `users:manage`. `x-admin-secret` and `VITE_ADMIN_SECRET` are not accepted.

- `admin_list`: body `{ "action": "admin_list", "status"?: string, "limit"?: number }`; returns minimal application summaries.
- `admin_update`: body `{ "action": "admin_update", "applicationId": "uuid", "status": "pending|approved|rejected|needs_revision", "reviewNotes"?: string }`; updates review status and timestamp and returns the minimal summary.

## Limitations and required follow-up

1. This change does not migrate frontend callers. Registration, status, signature upload, and admin screens must be migrated to this endpoint before the legacy direct table access is removed.
2. Existing `onboarding-admin` still uses `x-admin-secret` and has legacy behavior; it must be retired or migrated before claiming the whole onboarding surface is hardened.
3. `admin_update` deliberately does not create `yumi_users` accounts. Approval/account provisioning needs a separate server-side workflow that hashes credentials and has an explicit allowlist.
4. No SQL/RLS migration is included. Token hash and expiry are stored in the existing `raw` JSONB for newly created applications. Because current anon grants still expose the table, the hash is high-entropy but the legacy table remains an unsafe direct-access surface until RLS/grants and callers are migrated.
5. Existing rows that have plaintext passwords/PINs in `raw` are not rewritten by this task. A separate controlled cleanup is required.
6. Signature/PDF upload remains a separate storage concern. The endpoint accepts only already-created HTTPS URLs; frontend migration should upload through a protected storage boundary rather than public bucket writes.
