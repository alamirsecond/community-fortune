## Admin Settings API

### Overview
The Admin Settings API allows SUPERADMIN and ADMIN roles to manage platform configuration, including maintenance windows, security policies, notifications, payments, and presentation content. All endpoints below map to routes registered in [backend/src/api/Settingss/setting_routes.js](backend/src/api/Settingss/setting_routes.js).

### Authorization
- Every request must include `Authorization: Bearer <jwt>`.
- Allowed roles: `SUPERADMIN`, `ADMIN`.
- Requests are rejected with `401` if the header is missing/invalid and `403` if the role is insufficient.

### Change Admin Password
- **POST /settings/password/change**
- Body: `{ "oldPassword": string, "newPassword": string, "confirmNewPassword": string }`
- Rules: new password >= 8 chars, confirm must match, old password verified against DB.
- Responses: `200` success, `400` validation error, `401` incorrect credentials.

### Maintenance Mode
- **GET /settings/maintenance** → Returns maintenance toggle, whitelisted IPs, message, estimated duration sourced from cached system settings.
- **POST /settings/maintenance**
  - Body: `{ "maintenance_mode": boolean, "allowed_ips": string[], "maintenance_message": string, "estimated_duration": string }`
  - Updates persisted settings and invalidates the cache so middleware sees the new state instantly.
- Denial responses surface `maintenance_message`, `estimated_duration`, and caller IP to clients.

### Payment Gateways
- **GET /settings/payment-gateways** → List enabled user-facing methods with display names.
- **GET /settings/payment-gateways/all** → Full configuration rows from `payment_gateway_settings` plus enabled methods array.
- **POST /settings/payment-gateways/enable** / **disable**
  - Body: `{ "gateway": "PAYPAL" | "STRIPE" | "REVOLUT", "environment": "SANDBOX" | "LIVE" }`
  - Adds/removes method keys inside `system_settings.payment_enabled_methods` and logs admin activity.
- **POST /settings/payment-gateways/configure**
  - Body includes credential fields, min/max limits, and branding metadata; UPSERTS into `payment_gateway_settings` with audit logging.

### Transaction Limits
- **GET /settings/transaction-limits** → Reads system limit keys from `system_settings`.
- **POST /settings/transaction-limits**
  - Body: min/max deposit/withdrawal plus daily caps.
  - Values persist as strings and are coerced downstream when applied.

### Security Settings
- **GET /settings/security** → Fetches `security_*` keys (session timeout, captcha toggles, etc.).
- **POST /settings/security**
  - Body example: `{ "admin_session_timeout": 45, "enable_captcha_failed_attempts": true }`.
  - Writes prefixed keys, ensures values stored as strings, invalidates cache.

### Subscription Tiers
- **GET /settings/subscription-tiers** → Lists tiers with subscriber counts.
- **GET /settings/subscription-tiers/:id** → Single tier by UUID.
- **POST /settings/subscription-tiers**
  - Creates tier with pricing/benefits definition and optional perks.
- **PUT /settings/subscription-tiers/:id** → Updates editable fields.
- **DELETE /settings/subscription-tiers/:id** → Fails if active subscribers exist.

### Notification Settings
- **GET /settings/notifications**
  - Returns user notifications keyed by `notification_user_*` with `enabled` and `mandatory` flags, admin notification booleans, and editable email templates.
- **GET /settings/notifications/types**
  - Static definitions combining UI labels and mandatory flags for both user and admin categories.
- **POST /settings/notifications/enable** / **disable**
  - Body: `{ "type": string, "category": "user" | "admin" }`.
  - User notifications respect mandatory guardrails (password reset, OTP, welcome, winner). Admin notifications toggle freely.
- **POST /settings/notifications/email-templates**
  - Body: `{ "welcome_subject": string, ... }` writes `notification_email_*` entries.
- All writes invalidate the cache so gating logic (email sender, middleware) respects latest values.

### Legal & Compliance
- **GET /settings/age-verification** → Returns `age_verification_required` with defaults (18+, document upload).
- **POST /settings/age-verification**
  - Body: `{ "require_age_verification": boolean }`.

### Contact Settings
- **GET /settings/contact** → Returns `support_email`, phone numbers, and contact channels if configured.
- **POST /settings/contact**
  - Updates contact info fields stored under the `system_settings` namespace.

### System Settings
- **GET /settings/system** → Retrieves non-prefixed configuration such as `site_name`, `timezone`, `items_per_page`, feature toggles.
- **POST /settings/system**
  - Body: dictionary of key/value pairs; strings persisted with minimal coercion (booleans/ints handled downstream).

### Error Handling
- `400` validation errors include a descriptive `message` from schema checks.
- `401` authorisation failures surface a generic message; tokens are revalidated for each call.
- `403` indicates the caller lacks required role.
- `404` used when resources (tier IDs) are missing.
- `409` arises on conflicting gateway configuration changes.
- `500` wraps database or unexpected failures; verbose stack traces only in development.
