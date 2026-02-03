# middleware/auth.js

## Purpose
Ensure authenticated APIs respect maintenance mode while preserving existing wallet-selection logic.

## Key Updates
- Imported `systemSettingsCache` and added a maintenance gate that short-circuits requests with a 503 response when maintenance is active and caller lacks privilege or allowed IP.
- Reused the cache helper so maintenance allowances stay consistent with login flow and global middleware behaviour.
- Left wallet validation and enrichment untouched, keeping side effects for `x-selected-wallet` headers intact.

## Integration Notes
Because this middleware sits ahead of most private routes, the new gate guarantees that maintenance state applies uniformly across admin and user APIs without duplicating DB lookups.
