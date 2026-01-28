
## Instant Wins (instantWins module)

### (Admin) Create instant wins (bulk via ticket_numbers or pattern)

Endpoint: `{{baseUrl}}/api/instant-wins/admin/instant-wins`
Method: POST
Headers: `Authorization: Bearer {{adminToken}}`
Body (ticket_numbers example):

```json
{
  "competition_id": "{{competitionId}}",
  "ticket_numbers": [1, 50, 100],
  "prizes": [
    {
      "name": "£10 Site Credit",
      "value": 10,
      "type": "SITE_CREDIT",
      "max_winners": 1
    }
  ]
}
```

Body (pattern example):

```json
{
  "competition_id": "{{competitionId}}",
  "pattern": { "type": "RANDOM", "count": 10, "start": 1, "end": 1000 },
  "prizes": [
    {
      "name": "£5 Site Credit",
      "value": 5,
      "type": "SITE_CREDIT",
      "max_winners": 1
    }
  ]
}
```

### (Admin) Instant win reports (cards)

Endpoint: `{{baseUrl}}/api/instant-wins/admin/reports`
Method: GET
Headers: `Authorization: Bearer {{adminToken}}`
Query params (optional):

- `q`, `status` (`ACTIVE|ALL|...`), `page`, `limit`

### (Admin) Instant win analytics

Endpoint: `{{baseUrl}}/api/instant-wins/admin/analytics`
Method: GET
Headers: `Authorization: Bearer {{adminToken}}`
Query params (optional):

- `days` (3–30), `month_only=true|false`

### (Admin) Export all instant wins (CSV)

Endpoint: `{{baseUrl}}/api/instant-wins/admin/export`
Method: GET
Headers: `Authorization: Bearer {{adminToken}}`

### (Admin) View instant wins for a competition (details)

Endpoint: `{{baseUrl}}/api/instant-wins/admin/competition/{{competitionId}}`
Method: GET
Headers: `Authorization: Bearer {{adminToken}}`
Query params (optional):

- `status=CLAIMED|AVAILABLE`, `limit`, `offset`

### (Admin) Competition report

Endpoint: `{{baseUrl}}/api/instant-wins/admin/competition/{{competitionId}}/report`
Method: GET
Headers: `Authorization: Bearer {{adminToken}}`

### (Admin) Export competition instant wins (CSV)

Endpoint: `{{baseUrl}}/api/instant-wins/admin/competition/{{competitionId}}/export`
Method: GET
Headers: `Authorization: Bearer {{adminToken}}`

### (Admin) Create a single instant win manually

Endpoint: `{{baseUrl}}/api/instant-wins/admin/instant-wins/manual`
Method: POST
Headers: `Authorization: Bearer {{adminToken}}`
Body:

```json
{
  "competition_id": "{{competitionId}}",
  "ticket_number": 77,
  "prize_name": "VIP Hoodie",
  "prize_value": 0,
  "prize_type": "PHYSICAL_PRIZE",
  "payout_type": "PHYSICAL_PRIZE",
  "max_winners": 1
}
```

### (Admin) Update claimed status

Endpoint: `{{baseUrl}}/api/instant-wins/admin/instant-wins/claim-status`
Method: PATCH
Headers: `Authorization: Bearer {{adminToken}}`
Body:

```json
{
  "instant_win_id": "{{instantWinId}}",
  "claimed_by": "{{userId}}",
  "claimed_at": "2026-01-11T12:00:00.000Z",
  "increment_current_winners": true,
  "user_details": {
    "full_name": "John Doe",
    "address": "10 Example Street",
    "phone": "+44 7000 000000"
  }
}
```

### User: view my wins

Endpoint: `{{baseUrl}}/api/instant-wins/my-wins`
Method: GET
Headers: `Authorization: Bearer {{userToken}}`

### User: view competition instant wins

Endpoint: `{{baseUrl}}/api/instant-wins/competition/{{competitionId}}`
Method: GET
Headers: `Authorization: Bearer {{userToken}}`

### User: claim an instant win (instant win id)

Endpoint: `{{baseUrl}}/api/instant-wins/{{instantWinId}}/claim`
Method: POST
Headers: `Authorization: Bearer {{userToken}}`
Body:

```json
{
  "user_details": {
    "full_name": "John Doe",
    "address": "10 Example Street",
    "phone": "+44 7000 000000"
  }
}
```

---