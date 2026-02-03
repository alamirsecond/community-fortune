# src/Utils/systemSettingsCache.js

## Purpose
Provide a shared TTL-based cache for `system_settings` so maintenance checks and notification toggles can be resolved without repeated database queries.

## Key Updates
- Added helpers to normalize and resolve client IPs, including support for `x-forwarded-for`, IPv6, and wildcard allow-list entries.
- Exposed maintenance helpers that merge defaults, evaluate privileged roles, and report denial details back to callers.
- Centralised notification definitions so mandatory toggles (OTP, password reset, etc.) have enforced defaults across the codebase.
- Implemented prefix fetchers, boolean/string/JSON coercion, and an invalidate mechanism so updates propagate instantly.

## Integration Notes
All consumers—authentication middleware, login flow, notification services—now rely on this cache; invalidate it after any settings write to prevent stale reads.
