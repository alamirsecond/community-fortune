# middleware/maintenanceGuard.js

## Purpose
Introduce a global request gate that blocks public API traffic while the system is in maintenance mode.

## Key Updates
- Added a middleware that bypasses checks for authenticated requests and CORS preflight calls.
- Calls `systemSettingsCache.evaluateMaintenanceAccess` to honor cached maintenance configuration and IP allow list.
- Returns a structured 503 response that exposes the maintenance message, estimated duration, and caller IP for visibility.
- Logs unexpected failures and converts them to a 500 response so upstream handlers are protected from leakage.

## Integration Notes
Mounting the middleware before `/api` routing ensures every unauthenticated client request observes maintenance state without touching of downstream handlers.
