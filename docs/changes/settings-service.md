# src/api/Settingss/settings_service.js

## Purpose
Align settings reads and writes with the new cache layer while tightening validation for notification toggles.

## Key Updates
- Added imports from `systemSettingsCache` to reuse cached maintenance and notification metadata instead of re-querying the database.
- Extended notification definitions to include password reset and OTP defaults, exposing them through `getNotificationSettings` with mandatory flags.
- Normalised update logic to coerce booleans, skip attempts to disable mandatory notifications, and invalidate the cache after writes for maintenance, security, and notification payloads.
- Leveraged cache helpers (`getMaintenanceSettings`, `getSettingsByPrefix`, etc.) to simplify response assembly for admin screens.

## Integration Notes
All callers now receive consistent structures (enabled + mandatory) from `getNotificationSettings`; after any POST to these endpoints the cache is invalidated so the middleware sees the fresh values.
