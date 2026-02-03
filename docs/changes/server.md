# server.js

## Purpose
Wire maintenance enforcement into the main Express bootstrap so unauthenticated traffic is blocked early when maintenance mode is active.

## Key Updates
- Imported the new `maintenanceGuard` middleware alongside existing monitoring layers.
- Mounted the guard directly on the `/api` router so public endpoints share enforcement with authenticated flows.
- Kept the rest of the server startup, security headers, and upload wiring unchanged.

## Integration Notes
Mounting at the router boundary avoids interfering with health checks or static content while still protecting every API route.
