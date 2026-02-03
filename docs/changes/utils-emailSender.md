# src/Utils/emailSender.js

## Purpose
Honor notification toggles when dispatching transactional emails while retaining existing template coverage.

## Key Updates
- Imported `systemSettingsCache` and added an internal `isNotificationAllowed` helper that defers to cached system settings with safe fallbacks.
- Wrapped each outward-facing send helper (welcome, password reset, withdrawal lifecycle, OTP, KYC, winner alerts) so messages are suppressed when the matching toggle is disabled.
- Normalised OTP behaviour to reuse withdrawal toggles when applicable and return a `suppressed` flag to callers for auditability.

## Integration Notes
Callers can continue invoking the same helpers; when settings disable a channel they now receive a success response with `suppressed: true` instead of performing any SMTP work.
