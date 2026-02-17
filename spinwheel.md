
## Spin Wheel (spinWheel module)

### Active wheels available (public)

Endpoint: `{{baseUrl}}/api/spinWheel/wheels/active?tier=FREE`
Method: GET

### Spin (user)

Endpoint: `{{baseUrl}}/api/spinWheel/spin`
Method: POST
Headers: `Authorization: Bearer {{userToken}}`
Body:

```json
{
  "wheel_id": "{{wheelId}}",
  "competition_id": "{{competitionId}}"
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
      "user_total_winnings": 50.00
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
