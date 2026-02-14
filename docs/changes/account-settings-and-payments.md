# account-settings-and-payments.md

## Purpose
Introduce per-user account settings (notification and privacy toggles) and enforce user-owned payment methods for deposits, withdrawals, and ticket purchases.

## Key Updates
- Added a per-user account settings table to store notification and privacy preferences.
- Added helper utilities to read and save account settings with sane defaults.
- Added account settings endpoints and validation.
- Enforced user-owned payment methods for all external payment flows.
- Gated instant win and winner notifications by per-user preference.


## API Changes
- New account settings endpoints for users:
  - `GET /account-settings`
  - `PUT /account-settings`
- Ticket purchase endpoints accept `payment_method_id` when external payment is required.
- Deposits and withdrawals require `payment_method_id` and validate ownership.

## Notification Behavior
- Email notifications now require both:
  - Global system setting enabled
  - User preference enabled
- Instant win and winner notification inserts are skipped if the user opts out.

## Payment Ownership Enforcement
- Deposits: validate `payment_method_id` belongs to the requesting user.
- Withdrawals: validate `payment_method_id` belongs to the requesting user.
- Ticket purchases: validate and require `payment_method_id` for external payment.
- Universal ticket purchases: validate and require `payment_method_id` for external payment.

## Files Updated
- src/Utils/userAccountSettings.js
  - Added defaults, read/write helpers, notification key mapping.
- src/api/User/userController.js
  - Added get/update account settings endpoints and profile wiring.
- src/api/User/userRoutes.js
  - Added `GET/PUT /account-settings` routes.
- src/api/User/userSchemas.js
  - Added account settings schema validation.
- src/Utils/emailSender.js
  - Added user preference gating for notification emails.
- src/api/INSTANT WINS/instantWins_con.js
  - Respects `notifyInstantWins` preference before notification insert.
- src/api/WINNERS/winners_con.js
  - Respects `notifyWins` preference before notification insert.
- src/api/withdrawals/withdrawalController.js
  - Requires and stores user-owned `payment_method_id`.
- src/api/Payments/payment_service.js
  - Requires `payment_method_id` for deposits and withdrawals and checks ownership.
- src/api/Payments/SubscriptionTicketService.js
  - Requires and checks `payment_method_id` for external ticket purchases.
- src/api/Payments/payment_validator.js
  - Requires `payment_method_id` for deposits and withdrawals.
- src/api/withdrawals/withdrawalSchemas.js
  - Added `payment_method_id` and corrected gateway label spelling.
- src/api/TICKETS/tickets_zod.js
  - Added `payment_method_id` for ticket purchase input.
- src/api/Competition/competitionController.js
  - Passes `payment_method_id` through to ticket purchase flow.

## Notes for Clients
- When external payment is required, clients must send a valid `payment_method_id`.
- Wallet-only purchases do not require `payment_method_id`.
- Account settings endpoints should be used to read and update notification/privacy toggles.

## API Details

### GET /account-settings
Returns the current user's settings. If none exist, defaults are returned.

Response (200)
```json
{
  "success": true,
  "data": {
    "emailNotifications": {
      "notifyInstantWins": true,
      "notifyNewCompetitions": true,
      "notifyWins": true,
      "notifyWithdrawals": true,
      "newsletter": true
    },
    "privacySettings": {
      "showMyWinsPublicly": true,
      "showMyProfilePublicly": true,
      "showMyActivityPublicly": false
    }
  }
}
```

### PUT /account-settings
Updates the current user's settings.

Request
```json
{
  "emailNotifications": {
    "notifyInstantWins": false,
    "notifyNewCompetitions": true,
    "notifyWins": true,
    "notifyWithdrawals": false,
    "newsletter": false
  },
  "privacySettings": {
    "showMyWinsPublicly": false,
    "showMyProfilePublicly": true,
    "showMyActivityPublicly": false
  }
}
```

Response (200)
```json
{
  "success": true,
  "message": "Account settings updated successfully",
  "data": {
    "emailNotifications": {
      "notifyInstantWins": false,
      "notifyNewCompetitions": true,
      "notifyWins": true,
      "notifyWithdrawals": false,
      "newsletter": false
    },
    "privacySettings": {
      "showMyWinsPublicly": false,
      "showMyProfilePublicly": true,
      "showMyActivityPublicly": false
    }
  }
}
```

### POST /payments/deposits
Creates a deposit request. `payment_method_id` is required and must belong to the user.

Request
```json
{
  "amount": 50,
  "gateway": "STRIPE",
  "wallet_type": "CASH",
  "currency": "GBP",
  "payment_method_id": "7b8b4f1a-2a2b-4e0a-9c4f-9f5c4a2e7a2d"
}
```

Response (200)
```json
{
  "success": true,
  "message": "Deposit created successfully",
  "data": {
    "request_id": "9d799d3d-3c7c-4a60-8a1b-1f0b9dd54d8b",
    "gateway": "STRIPE",
    "amount": 50,
    "currency": "GBP",
    "status": "PENDING",
    "client_secret": "pi_12345_secret_67890"
  }
}
```

### POST /payments/withdrawals
Creates a withdrawal request. `payment_method_id` is required and must belong to the user.

Request
```json
{
  "amount": 100,
  "gateway": "PAYPAL",
  "payment_method_id": "b7c3d8a5-8f2a-4a1f-8b2d-35d7e3baf01c",
  "account_details": {
    "receiver_email": "user@example.com"
  }
}
```

Response (200)
```json
{
  "success": true,
  "message": "Withdrawal request created",
  "data": {
    "withdrawal_id": "0f8d2f9e-3c34-4b36-9d08-35b0f9c6df7a",
    "amount": 100,
    "currency": "GBP",
    "status": "PENDING"
  }
}
```

### POST /payments/tickets/purchase
Purchases competition tickets using wallet balance and/or external payment. If external payment is required, `payment_method_id` is required and must belong to the user.

Request
```json
{
  "competition_id": "2ab1de4b-7a9e-4b86-b4ae-9b2c1a4d1f33",
  "quantity": 3,
  "payment_method": "STRIPE",
  "use_wallet": true,
  "payment_method_id": "c85a89e6-9f09-4f3f-9a0b-3a1f9f23d0d1"
}
```

Response (200)
```json
{
  "success": true,
  "message": "Tickets purchased successfully",
  "data": {
    "purchaseId": "f8a2df8b-2b9f-4f6e-9a2e-2e1d4b2f00e3",
    "ticketNumbers": [12, 13, 14],
    "totalAmount": 9,
    "walletUsed": 4,
    "externalPayment": 5,
    "paymentMethod": "MIXED",
    "competitionTitle": "Weekly Draw"
  }
}
```

### POST /payments/tickets/universal
Purchases universal tickets (if exposed). If external payment is required, `payment_method_id` is required and must belong to the user.

Request
```json
{
  "ticket_type": "JACKPOT",
  "quantity": 5,
  "payment_method": "PAYPAL",
  "use_wallet": true,
  "payment_method_id": "2a1c9d1c-6f2c-4a0b-a3a5-5d4d7dbd7b23"
}
```

Response (200)
```json
{
  "success": true,
  "message": "Universal tickets purchased successfully",
  "data": {
    "purchaseId": "b4c2f9d6-8c2b-4c2a-9c66-2c1fb45fe2b1",
    "ticketType": "JACKPOT",
    "quantity": 5,
    "totalAmount": 10,
    "walletUsed": 0,
    "externalPayment": 10,
    "paymentMethod": "PAYPAL"
  }
}
```

## Error Responses
Missing or invalid payment method
```json
{
  "success": false,
  "error": "Payment method is required"
}
```

Payment method not owned by user
```json
{
  "success": false,
  "error": "Payment method not found for user"
}
```
