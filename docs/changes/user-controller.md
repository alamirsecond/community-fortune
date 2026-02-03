# src/api/User/userController.js

## Purpose
Make the user login flow respect maintenance mode alongside authenticated middleware.

## Key Updates
- Imported `systemSettingsCache` and invoked `evaluateMaintenanceAccess` before password verification so standard users are blocked while maintenance is active.
- Returned the same 503 payload shape as other guards, including maintenance message, duration, and caller IP for observability.
- Left downstream logic (password checks, email verification, wallet aggregation) untouched to avoid behavioural drift when maintenance is inactive.

## Integration Notes
This mirrors the behaviour enforced in the authentication middleware, ensuring that login attempts from unprivileged users receive a consistent maintenance response.
