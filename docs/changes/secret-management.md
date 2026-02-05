# Secret & Payment Credential Management Updates

This document captures the changes introduced to support UI-driven management of JWT and payment provider secrets, along with the runtime updates required for those secrets to be honored across the platform.

## 1. Secure Secret Storage

- Added [src/Utils/secretManager.js](src/Utils/secretManager.js) to provide AES-256-GCM encryption for any credential stored inside the `system_settings` table.
- Secrets are encrypted using a derived key from `SECRET_ENCRYPTION_KEY` (preferred) or `ENCRYPTION_KEY`. The key must be **32+ characters** and identical across all servers.
- Values are cached in-memory with a TTL controlled by `SECRET_CACHE_TTL` (default 5 minutes) to limit database reads.
- Utility exports:
  - `SECRET_KEYS`: canonical keys for JWT, PayPal, Stripe, and Revolut secrets.
  - `getSecret`, `setSecret`, `deleteSecret`, and status helpers used by controllers/middleware.

### Environment additions

```
SECRET_ENCRYPTION_KEY=<base64-or-hex 32-byte key>
SECRET_CACHE_TTL=300000  # optional override in ms
```

Without the encryption key the API will reject secret writes and runtime consumption.

## 2. Admin Endpoints for Secrets

Changes live in [src/api/Settingss/settings_service.js](src/api/Settingss/settings_service.js) and [src/api/Settingss/settings_controller.js](src/api/Settingss/settings_controller.js), exposed via [src/api/Settingss/setting_routes.js](src/api/Settingss/setting_routes.js).

### `GET /api/settings/secrets`

- Roles: `ADMIN`, `SUPERADMIN` (read-only for Admins).
- Returns grouped metadata (JWT, PayPal, Stripe, Revolut) showing:
  - `isConfigured` flag per field.
  - Last update timestamp and admin UUID.
  - Helpful description + original env var name for UI cues.
- No secret values are ever returned.

### `POST /api/settings/secrets`

- Roles: `SUPERADMIN` only.
- Accepts either flat keys (`stripeSecretKey`, `PAYPAL_CLIENT_ID`) or nested group objects:

```json
{
  "jwtSecret": "...",
  "paypal": {
    "clientId": "...",
    "clientSecret": "...",
    "webhookId": "..."
  },
  "stripe": {
    "publishableKey": "...",
    "secretKey": "...",
    "webhookSecret": "...",
    "connectClientId": "..."
  },
  "revolut": {
    "apiKey": "...",
    "webhookSecret": "...",
    "defaultAccountId": "..."
  }
}
```

- Each value is encrypted via `secretManager.setSecret(...)` and persisted in `system_settings` using the `secret.*` key namespace.
- Response mirrors the `GET` payload so the UI can refresh status without a second call.
- Validation & errors:
  - Empty strings are rejected (`400 Invalid request body`).
  - Unknown field names trigger `400 Unknown secret field: <name>` to help map UI inputs to backend keys.
  - Missing encryption key yields `500 Secret encryption key missing...` with guidance to set `SECRET_ENCRYPTION_KEY`.

#### Upload sequence from the UI

1. **Fetch status**: call `GET /api/settings/secrets` to show which providers still need configuration.
2. **Collect values**: when the admin submits the form, build a JSON payload using either grouped objects (`{ paypal: { clientId } }`) or flat fields.
3. **Submit**: POST to `/api/settings/secrets` with the bearer token of a `SUPERADMIN` account.
4. **Encryption**: the controller hands each field to `secretManager.setSecret` where it is AES-256-GCM encrypted and stored as `secret.<provider>.<field>` inside `system_settings`.
5. **Cache invalidation**: the secret manager clears the per-key cache so runtime consumers pick up the new value immediately.
6. **UI refresh**: the response contains the same grouped structure including `isConfigured`, `updatedAt`, and `updatedBy`. Use it to update the dashboard without an extra read.

**Note:** The actual secret values are never returned after upload. To rotate a credential, simply POST a new value; it overwrites the stored ciphertext and invalidates caches.

## 3. Runtime Consumers Switched to Secret Store

### Authentication

- [middleware/authHelpers.js](middleware/authHelpers.js) now fetches the JWT signing secret via `secretManager` before calling `jwt.sign`. `generateToken` became `async` and all callers (`userController`) now `await` it.
- [middleware/auth.js](middleware/auth.js) resolves the verification secret the same way. If the secret is missing, requests fail with HTTP 500 + descriptive error.

### Payment Webhooks & Gateway Clients

- [middleware/payment_middleware.js](middleware/payment_middleware.js)
  - Stripe: loads API key + webhook secret from storage and verifies signatures via `stripe.webhooks.constructEvent`.
  - PayPal: fetches client credentials + webhook ID, then runs the official `VerifyWebhookSignature` request. Missing headers short-circuit with 401.
  - Revolut: uses the stored webhook secret for HMAC verification. Errors return 500 when secrets are absent.
- [src/api/Payments/payment_service.js](src/api/Payments/payment_service.js)
  - Stripe and Revolut gateway initialization now depend on DB-stored credentials (through `getGatewayConfigurations`).
  - Default Revolut payout account ID is read via `secretManager.getSecret(..., optional: true)` so payouts can fall back gracefully.
- [src/config/paypal.js](src/config/paypal.js)
  - `configurePayPal()` is now `async` and always reads client credentials from the secret store before building the SDK client.

## 4. Settings Documentation & Environment Files

- Updated [.env](.env) and [.env.example](.env.example) with the `SECRET_ENCRYPTION_KEY` + `SECRET_CACHE_TTL` variables and guidance on generating a 64-character value (e.g., `openssl rand -base64 64`).
- Expanded [settings.md](settings.md) with a "Secret Management" section describing the new endpoints, payloads, permission requirements, and guarantees.

## 5. Migration / Usage Notes

1. **Set the encryption key first** (`SECRET_ENCRYPTION_KEY`). Restart the API so `secretManager` can derive AES material.
2. Call `POST /api/settings/secrets` as a SUPERADMIN to seed JWT, PayPal, Stripe, and Revolut credentials.
3. Verify:
   - Admin login + JWT issuance works (ensures the JWT secret is readable).
   - Stripe/PayPal/Revolut webhooks succeed with the new verification logic.
4. Remove legacy `.env` copies of those secrets if desired—the runtime now prefers the DB values and only falls back to env vars when the database has never been populated.

These changes centralize credential management, remove plaintext secrets from repositories, and enable the admin UI to rotate keys without redeploying backend services.
