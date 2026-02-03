# Admin Settings – Notification Endpoints (Test Guide)

This document gives step-by-step tests (curl/Postman style) for all notification settings endpoints.

Source routes: `src/api/Settingss/setting_routes.js`

- `GET  /settings/notifications`
- `GET  /settings/notifications/types`
- `POST /settings/notifications/enable`
- `POST /settings/notifications/disable`
- `POST /settings/notifications/email-templates`

> Notes
> - All these endpoints require JWT auth and role `ADMIN` or `SUPERADMIN`.
> - These endpoints update rows inside `system_settings`.
> - Notification toggles are consumed by the email sender via `systemSettingsCache`.

---

## 0) Setup

### Required headers

- `Authorization: Bearer <ADMIN_JWT>`
- `Content-Type: application/json`

### Base URL

Replace `BASE_URL` with your API URL:
- Local example: `http://localhost:4000`

In examples below:
- `BASE_URL=http://localhost:4000`
- `TOKEN=<ADMIN_JWT>`

---

## 1) Get current notification settings

### Endpoint

- `GET /settings/notifications`

### curl

```bash
curl -sS "$BASE_URL/api/settings/notifications" \
  -H "Authorization: Bearer $TOKEN"
```

### Expected response (shape)

- `200 OK`
- `data.user_notifications` → object keyed by notification type.
- Each user notification has:
  - `enabled: boolean`
  - `mandatory: boolean`

Example (trimmed):

```json
{
  "success": true,
  "data": {
    "user_notifications": {
      "welcome_email": { "enabled": true, "mandatory": true },
      "marketing_emails": { "enabled": false, "mandatory": false },
      "password_reset": { "enabled": true, "mandatory": true },
      "otp": { "enabled": true, "mandatory": true }
    },
    "admin_notifications": {
      "new_user_signup": true,
      "system_alerts": true
    },
    "email_templates": {
      "welcome_subject": "Welcome to Community Fortune!",
      "welcome_body": "Welcome {{username}}! ..."
    }
  }
}
```

### What to validate

- `password_reset` and `otp` exist and show `mandatory: true`.
- Values match defaults seeded in `databaseSQL.sql` (unless you already changed them).

---

## 2) Get supported notification types

### Endpoint

- `GET /settings/notifications/types`

### curl

```bash
curl -sS "$BASE_URL/api/settings/notifications/types" \
  -H "Authorization: Bearer $TOKEN"
```

### Expected response

- `200 OK`
- `data.user[]` and `data.admin[]`
- Each `data.user[]` contains: `key`, `name`, `mandatory`

What to validate:
- Mandatory ones include: `welcome_email`, `winner_notification`, `password_reset`, `otp`.

---

## 3) Enable a notification type

This writes a boolean setting into `system_settings`:

- User category: `notification_user_<type>`
- Admin category: `notification_admin_<type>`

### Endpoint

- `POST /settings/notifications/enable`

### Request body

```json
{
  "category": "user",
  "type": "marketing_emails"
}
```

### curl

```bash
curl -sS -X POST "$BASE_URL/api/settings/notifications/enable" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"category":"user","type":"marketing_emails"}'
```

### Expected response

```json
{ "success": true, "message": "Notification type enabled successfully" }
```

### Verify it took effect

1) Re-fetch settings:

```bash
curl -sS "$BASE_URL/api/settings/notifications" -H "Authorization: Bearer $TOKEN"
```

2) Confirm:
- `data.user_notifications.marketing_emails.enabled === true`

---

## 4) Disable a notification type

### Endpoint

- `POST /settings/notifications/disable`

### Request body

```json
{
  "category": "user",
  "type": "marketing_emails"
}
```

### curl

```bash
curl -sS -X POST "$BASE_URL/api/settings/notifications/disable" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"category":"user","type":"marketing_emails"}'
```

### Expected response

```json
{ "success": true, "message": "Notification type disabled successfully" }
```

### Verify it took effect

Re-fetch `/settings/notifications` and confirm:
- `data.user_notifications.marketing_emails.enabled === false`

---

## 5) Mandatory notifications (important)

Some user notifications are mandatory. In your implementation:
- They show as `mandatory: true`.
- The `updateNotificationSettings` endpoint refuses to disable them.

### How to test mandatory behavior

1) Confirm mandatory flag:

- `GET /settings/notifications/types`
- Find `password_reset` and `otp` → `mandatory: true`

2) Try disabling a mandatory type using `/disable`:

```bash
curl -sS -X POST "$BASE_URL/api/settings/notifications/disable" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"category":"user","type":"otp"}'
```

What you’ll likely observe:
- The endpoint may return `success: true` because it only writes system_settings directly.
- But the system may still treat OTP as mandatory (depending on where enforcement is applied).

**Recommended validation:**
- Prefer testing mandatory enforcement through the structured update endpoint (`POST /settings/notifications` if you add/enable it), OR confirm DB keys after the call.

If you want strict enforcement for `/enable` and `/disable` too, that requires a small code change (service should block disabling `mandatory: true`).

---

## 6) Update email templates

### Endpoint

- `POST /settings/notifications/email-templates`

### Request body

You can send any keys; they are stored as `email_template_<key>` in `system_settings`.

Example:

```json
{
  "welcome_subject": "Welcome to Community Fortune!",
  "welcome_body": "Hello {{username}}, welcome!"
}
```

### curl

```bash
curl -sS -X POST "$BASE_URL/api/settings/notifications/email-templates" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"welcome_subject":"Welcome to Community Fortune!","welcome_body":"Hello {{username}}, welcome!"}'
```

### Expected response

```json
{
  "success": true,
  "message": "Email templates updated successfully"
}
```

### Verify it took effect

- Re-fetch `/settings/notifications` and confirm `data.email_templates.welcome_subject/body` reflect your update.

---

## 7) End-to-end verification: toggle actually changes user email sending

The toggles are enforced inside `src/Utils/emailSender.js`.

### What to test

1) Disable a notification type (example: `welcome_email`)
2) Trigger the feature that sends it (example: user registration)
3) Confirm the email helper returns:

```json
{ "success": true, "suppressed": true }
```

### Example toggles that map to email helpers

- `welcome_email` → `sendWelcomeEmail(...)`
- `password_reset` → `sendPasswordResetEmail(...)`
- `withdrawal_notification` → withdrawal lifecycle emails (request/approved/rejected/etc.)
- `otp` → `sendOTPEmail(..., context !== "withdrawal")`

If you want, I can add a small internal admin-only test endpoint like `/api/system/test-email` that calls these helpers so you can verify suppression without going through full user flows.

---

## 8) Common errors

### 401 Unauthorized
- Missing/invalid `Authorization` header.

### 403 Forbidden
- JWT is valid, but role is not `ADMIN` or `SUPERADMIN`.

### 400 Bad Request
- Missing `type` or `category`.

### 500 Internal Server Error
- DB connectivity issue or a service exception.
