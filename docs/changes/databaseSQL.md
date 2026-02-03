# databaseSQL.sql

## Purpose
Seed maintenance defaults and ensure new notification toggles exist for password reset and OTP flows.

## Key Updates
- Added `notification_user_password_reset` and `notification_user_otp` rows to the default `system_settings` seed data so toggles are present in all environments.
- Preserved existing maintenance, payment, and email template seed entries to keep bootstrap coverage intact.

## Integration Notes
Running the seeder on a fresh database now provisions every toggle that the cache and email sender expect, eliminating missing-key fallbacks.
