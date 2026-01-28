
---

## Vouchers (voucher module)

### (Admin) Voucher overview cards

Endpoint: `{{baseUrl}}/api/vouchers/admin/overview`
Method: GET
Headers: `Authorization: Bearer {{adminToken}}`

### (Admin) Create a voucher (single/multi/bulk)

Endpoint: `{{baseUrl}}/api/vouchers/admin/create`
Method: POST
Headers: `Authorization: Bearer {{adminToken}}`
Body (single-use example):

```json
{
  "campaign_name": "New User Welcome",
  "voucher_type": "SINGLE_USE",
  "reward_type": "SITE_CREDIT",
  "reward_value": 50,
  "start_date": "2026-01-11",
  "expiry_date": "2026-12-31",
  "usage_limit": 1,
  "code": "WELCOME50"
}
```

Body (multi-use example):

```json
{
  "campaign_name": "Spring Promo",
  "voucher_type": "MULTI_USE",
  "reward_type": "SITE_CREDIT",
  "reward_value": 10,
  "start_date": "2026-03-01",
  "expiry_date": "2026-06-30",
  "usage_limit": 1000,
  "code": "SPRING2026"
}
```

Body (bulk codes example):

```json
{
  "campaign_name": "VIP Bulk Drop",
  "voucher_type": "BULK_CODES",
  "reward_type": "SITE_CREDIT",
  "reward_value": 5,
  "start_date": "2026-01-11",
  "expiry_date": "2026-02-11",
  "bulk_quantity": 50,
  "bulk_code_length": 8,
  "code_prefix": "VIP",
  "code": "VIPBULK"
}
```

Notes:

- For bulk vouchers, the API auto-generates individual codes into `voucher_codes`.

### (Admin) List vouchers (filters like the UI)

Endpoint: `{{baseUrl}}/api/vouchers/admin/list`
Method: GET
Headers: `Authorization: Bearer {{adminToken}}`
Query params (optional):

- `page`, `limit`, `q`
- `is_active=true|false`
- `status=active|expired|scheduled|inactive`
- `type=SINGLE_USE|MULTI_USE|BULK_CODES`
- `sort=latest|value_desc|expiry_asc|usage_desc|usage_asc`

### (Admin) Export vouchers (CSV)

Endpoint: `{{baseUrl}}/api/vouchers/admin/export`
Method: GET
Headers: `Authorization: Bearer {{adminToken}}`
Query params: same as list.

### (Admin) View voucher details

Endpoint: `{{baseUrl}}/api/vouchers/admin/{{voucherId}}`
Method: GET
Headers: `Authorization: Bearer {{adminToken}}`

### (Admin) Update voucher

Endpoint: `{{baseUrl}}/api/vouchers/admin/{{voucherId}}`
Method: PUT
Headers: `Authorization: Bearer {{adminToken}}`
Body (example):

```json
{
  "campaign_name": "Updated Campaign",
  "reward_value": 25,
  "expiry_date": "2026-12-31",
  "is_active": true
}
```

### (Admin) Toggle active

Endpoint: `{{baseUrl}}/api/vouchers/admin/{{voucherId}}/toggle`
Method: PATCH
Headers: `Authorization: Bearer {{adminToken}}`
Body:

```json
{
  "is_active": false
}
```

### (Admin) Delete voucher

Endpoint: `{{baseUrl}}/api/vouchers/admin/{{voucherId}}`
Method: DELETE
Headers: `Authorization: Bearer {{adminToken}}`

### (User) Validate voucher code

Endpoint: `{{baseUrl}}/api/vouchers/validate`
Method: POST
Headers: `Authorization: Bearer {{userToken}}`
Body:

```json
{
  "code": "WELCOME50"
}
```

### (User) Redeem voucher code

Endpoint: `{{baseUrl}}/api/vouchers/redeem`
Method: POST
Headers: `Authorization: Bearer {{userToken}}`
Body:

```json
{
  "code": "WELCOME50"
}
```

---