# Spending Limits (Responsible Gaming)

## Overview
This section documents the spending limits functionality that supports the
responsible gaming requirements. Users may set daily, weekly, monthly and
single-purchase limits. Limits are enforced during withdrawals and can be
modified by users within administrator‑defined caps. Administrators can also
reset users' spending counters.

The database table used is `spending_limits` (see `databaseSQL.sql`). Alongside
limits, the system tracks `daily_spent`, `weekly_spent` and `monthly_spent`.

## Endpoints

### User-facing
- **GET** `/api/wallet/spending-limits`  
  Retrieves the current limits along with wallet balance and verification status.

- **PUT** `/api/wallet/spending-limits`  
  Updates limits. Request body may include any of `dailyLimit`, `weeklyLimit`,
  `monthlyLimit`, `singlePurchaseLimit`. Values are capped (100000, 500000,
  2000000, 50000 respectively). Decreases take effect immediately; increases may
  take up to 24 hours.

### Admin
- **POST** `/api/wallet/admin/reset-spending`  
  Clears the `daily_spent`, `weekly_spent` and `monthly_spent` counters for a
  user. Intended for support or corrective actions.

## Behaviour and Validation
- Withdrawal creation (see `withdrawalController.js`) includes spending limit
  checks. If a pending/processed amount would push a user over their daily,
  weekly or monthly limit, the withdrawal is rejected with an error message
  describing the limit and remaining allowance.
- If a withdrawal is rejected or refunded, the spent amounts are rolled back.
- Limits are stored per-user in `spending_limits` table; a row is automatically
  created when a new user account is added.
- The `updateSpendingLimits` action logs changes in `admin_activities`.

## Sample Request/Response

**PUT /api/wallet/spending-limits**
```json
{
  "dailyLimit": 5000,
  "weeklyLimit": 20000
}
```
Success response contains new limits and explanatory metadata:
```json
{
  "success": true,
  "message": "Spending limits updated successfully",
  "data": {
    "limits": {"daily_limit":5000,"weekly_limit":20000,...},
    "effective": {"daily":"Immediately for decreases, 24 hours for increases",...},
    "notes": ["Decreases take effect immediately","Increases may take up to 24 hours","You can adjust limits at any time","Contact support if you need help"]
  }
}
```

## Notes
- The spending limits feature is evaluated during withdrawals and is part of
  the responsible gaming checks (PDF Section D in requirements).
- User accounts with KYC not verified are prevented from setting or exceeding
  limits until verification is completed.

## Related Files
- `src/api/withdrawals/withdrawalController.js` (limit enforcement)
- `src/api/spendingLimits/spending_limit_con.js` and router
- `databaseSQL.sql` (table definition)

---
*This document was auto‑created because no dedicated spending‑limit markdown
was found in the repository.*
