
## Spin Wheel (spinWheel module)

### Active wheels available (public)

Endpoint: `{{baseUrl}}/api/spinWheel/wheels/active?tier=FREE`
Method: GET

### Spin (user)

Endpoint: `{{baseUrl}}/api/spinWheel/spin`
Method: POST
Headers: `Authorization: Bearer {{userToken}}`
Body (JSON):

```json
{
  "wheel_id": "{{wheelId}}",
  "competition_id": "{{competitionId}} , // optional - only when spin is linked to a competition",
  "purchase_id": "{{purchaseId}}" // optional - required for paid wheels when using a prior purchase
}
```

Notes:
- For free wheels or when the user has available spins/bonus spins, `purchase_id` is not required.
- For paid wheels the client must either:
  - create a purchase via `POST /api/spinWheel/wheels/:wheel_id/purchase` and pass the returned `purchase_id` to `/spin`, or
  - use wallet-based purchases (see examples below).
- When `purchase_id` is provided the backend validates it is `PAID` and atomically decrements `quantity` (one spin consumed per call).
- If the purchase `quantity` is greater than 1 you can reuse the same `purchase_id` until quantity reaches zero.

---

### Purchase spins (paid wheels)

Endpoint: `{{baseUrl}}/api/spinWheel/wheels/:wheel_id/purchase`
Method: POST
Headers: `Authorization: Bearer {{userToken}}`

Purpose: create a purchase record for one-or-more spins. Supports wallet (immediate PAID) and external gateways (PayPal/Stripe). The endpoint returns a `purchase_id` and either confirms payment or returns gateway instructions.

Request bodies (examples):

- Wallet purchase (deducts from user's site wallets immediately):

```json
{ "quantity": 1, "use_wallet": true }
```

- External gateway purchase (PayPal / Stripe):

```json
{ "quantity": 1, "payment_method": "PAYPAL" }
```

Responses (examples):

- Wallet (paid immediately)

```json
{ "success": true, "purchase_id": "<uuid>", "paid": true, "amount": 10.00 }
```

- External gateway (requires client to complete payment):

```json
{
  "success": true,
  "requires_payment": true,
  "purchase_id": "<uuid>",
  "amount": 10.00,
  "external_amount": 10.00,
  "payment": {
    "reference": "<PAYPAL_ORDER_ID_or_STRIPE_ID>",
    "checkoutUrl": "https://..."  // or clientSecret for Stripe
  }
}
```

Client flow (recommended):
1. Call POST /api/spinWheel/wheels/:wheel_id/purchase to create a purchase.
   - If response `paid: true` → you have a `purchase_id` ready to use.
   - If response `requires_payment: true` → complete gateway checkout (use returned checkoutUrl or clientSecret).
2. After payment completes (webhook or client returns success), call POST /api/spinWheel/spin with body:

```json
{ "wheel_id": "<wheelId>", "purchase_id": "<purchaseId>" }
```

3. Server validates purchase (must be PAID), consumes one spin (decrements `quantity`), runs the spin transaction and returns the prize result.

Notes on multi‑spin purchases:
- `quantity` in the purchase represents remaining spins; each /spin with that `purchase_id` consumes one unit.
- The backend enforces atomic checks (purchase must belong to the user, `status === 'PAID'`, and `quantity > 0`).

---

### Spin result (example when using `purchase_id`)

```json
{
  "success": true,
  "spin_id": "<uuid>",
  "prize": { "name": "10 Points", "type": "POINTS", "value": 10 },
  "award_result": { "type": "POINTS", "amount": 10 },
  "spin_remaining": 0
}
```

### Spin history (user)

Endpoint: `{{baseUrl}}/api/spinWheel/spin/history`
Method: GET
Headers: `Authorization: Bearer {{userToken}}`

### Spin statistics (user)

Endpoint: `{{baseUrl}}/api/spinWheel/spin/statistics`
Method: GET
Headers: `Authorization: Bearer {{userToken}}`

### Eligibility across wheels (user)

Endpoint: `{{baseUrl}}/api/spinWheel/spin/eligibility`
Method: GET
Headers: `Authorization: Bearer {{userToken}}`

### (Admin) Create wheel

Endpoint: `{{baseUrl}}/api/spinWheel/admin/create_wheels`
Method: POST
Headers: `Authorization: Bearer {{adminToken}}`
Body:

```json
{
  "name": "Daily Wheel",
  "type": "DAILY",
  "description": "Daily free spins",
  "rules": [
    {
      "title": "Rule 1",
      "description": "Must be 18+"
    }
  ],
  "ticket_price": 0,
  "min_tier": "FREE",
  "spins_per_user_period": "DAILY",
  "max_spins_per_period": 1,
  "cooldown_hours": 24,
  "background_image_url": "https://example.com/wheel.png",
  "animation_speed_ms": 4000,
  "is_active": true
}
```

### (Admin) List wheels

Endpoint: `{{baseUrl}}/api/spinWheel/admin/get_all_wheels`
Method: GET
Headers: `Authorization: Bearer {{adminToken}}`

### (Admin) Get wheel by id

Endpoint: `{{baseUrl}}/api/spinWheel/admin/get_wheels_byId/{{wheelId}}`
Method: GET
Headers: `Authorization: Bearer {{adminToken}}`
Response:

```json
{
  "wheel": {
    "id": "...",
    "wheel_name": "Daily Wheel",
    "ticket_price": 10.00,
    "rules": [{"title": "Rule 1", "description": "..."}]
    ...
  },
  "segments": [...],
  "statistics": { ... },
  "user_statistics": {
      "user_total_spins": 5,
      "user_last_spin": "2024-03-20T10:00:00Z",
      "user_total_winnings": 50.00,
      "available_spins": 3,          // spins left in current period (resets after cooldown)
      "max_spins": 8,                // period limit
      "next_available": "2024-03-21T10:00:00Z" // when next spin becomes available
  }
}
```

### (Admin) Update wheel

Endpoint: `{{baseUrl}}/api/spinWheel/admin/update_wheels/{{wheelId}}`
Method: PUT
Headers: `Authorization: Bearer {{adminToken}}`
Body (example):

```json
{
  "description": "Updated description",
  "is_active": true
}
```

### (Admin) Add segments (probabilities must sum to 100)

Endpoint: `{{baseUrl}}/api/spinWheel/admin/wheels/add_segments`
Method: POST
Headers: `Authorization: Bearer {{adminToken}}`
Body:

```json
{
  "wheel_id": "{{wheelId}}",
  "segments": [
    {
      "position": 1,
      "color_hex": "#FF00FF",
      "prize_name": "10 Points",
      "prize_type": "POINTS",
      "prize_value": 10,
      "probability": 50,
      "text_color": "#FFFFFF"
    },
    {
      "position": 2,
      "color_hex": "#00FFFF",
      "prize_name": "No Win",
      "prize_type": "NO_WIN",
      "prize_value": 0,
      "probability": 50,
      "text_color": "#000000"
    }
  ]
}
```

### (Admin) Wheel analytics

Endpoint: `{{baseUrl}}/api/spinWheel/admin/wheels/{{wheelId}}/analytics`
Method: GET
Headers: `Authorization: Bearer {{adminToken}}`
Query params (optional):

- `start_date=2026-01-01&end_date=2026-01-11`

### (Admin) Export spin history

Endpoint: `{{baseUrl}}/api/spinWheel/admin/wheels/{{wheelId}}/export?format=csv`
Method: GET
Headers: `Authorization: Bearer {{adminToken}}`
Query params (optional):

- `format=csv|json`, `start_date`, `end_date`
