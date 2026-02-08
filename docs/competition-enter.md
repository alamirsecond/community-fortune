# Enter Competition Endpoint

Purchase tickets and enter a competition in a single call. Wraps the payment module (wallet/Stripe/PayPal/Revolut) and allocates tickets to the competition.

## Endpoint
- **URL:** `POST /api/competitions/:id/enter`
- **Auth:** Required (user)
- **Content-Type:** `application/json`

## Request
| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` (path) | string (UUID) | yes | Competition ID |
| `quantity` | integer | no | Defaults to 1. Range 1-100 |
| `payment_method` | enum | no | `WALLET` (default), `STRIPE`, `PAYPAL`, `REVOLUT` |
| `use_wallet` | boolean | no | Default `true`. When true, credit/cash wallets are applied before external payment |

### Example (wallet-only)
```json
{
  "quantity": 2,
  "payment_method": "WALLET",
  "use_wallet": true
}
```

### Example (Revolut checkout)
```json
{
  "quantity": 1,
  "payment_method": "REVOLUT",
  "use_wallet": false
}
```

## Responses
### 200 Success
```json
{
  "success": true,
  "message": "Entry created successfully",
  "data": {
    "competition_id": "<uuid>",
    "tickets": [
      {
        "id": 123,               // db insertId from purchases/tickets flow
        "ticket_number": 42,
        "competition_id": "<uuid>",
        "purchase_id": 456
      }
    ],
    "purchase": {
      "purchaseId": 456,
      "ticketNumbers": [42],
      "externalPayment": 10,
      "walletUsed": 0,
      "paymentMethod": "REVOLUT",
      "checkoutUrl": "https://sandbox-b2b.revolut.com/..."
    },
    "next_action": "PLAY_OR_SCORE"
  }
}
```

### Common Errors
| HTTP | Message | When |
| --- | --- | --- |
| 400 | Competition ID is required | Missing `:id` |
| 400 | Quantity must be between 1 and 100 | Invalid `quantity` |
| 400 | Competition is not active / has ended | Status/end-date checks fail |
| 400 | Failed to enter competition | Generic purchase/validation error (see `error` field) |
| 401 | Authentication required | Missing/invalid auth |
| 404 | Competition not found | Invalid ID |

## Flow Notes
- Delegates to `SubscriptionTicketService.purchaseTickets` for payment + ticket allocation.
- Wallet-first: if `use_wallet` is true, credit then cash wallet balances are applied before charging an external gateway.
- External methods return gateway data:
  - Stripe: `clientSecret` for Payment Intent.
  - PayPal/Revolut: `checkoutUrl` for redirect/approval.
- On success, tickets are inserted and competition `sold_tickets` is incremented. If sold out, draw is scheduled.

## Testing Checklist
- Active competition with available tickets.
- Wallet-only purchase (enough balance) -> `payment_method: WALLET`.
- Mixed wallet + external (partial wallet coverage) -> `payment_method: STRIPE|PAYPAL|REVOLUT`, `use_wallet: true`.
- Pure external (no wallet use) -> `use_wallet: false`.
- Expired/inactive competition should return 400.
