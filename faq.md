
---

## FAQs (HOME + SUBSCRIPTION)

### Public FAQ list (Home FAQ)

Endpoint: `{{baseUrl}}/api/faqs?scope=HOME&published=true`
Method: GET

### Public FAQ list (Subscription FAQ)

Endpoint: `{{baseUrl}}/api/faqs?scope=SUBSCRIPTION&published=true`
Method: GET

### (Admin) List FAQs

Endpoint: `{{baseUrl}}/api/faqs/admin?scope=HOME&published=false`
Method: GET
Headers: `Authorization: Bearer {{adminToken}}`

### (Admin) View FAQ details

Endpoint: `{{baseUrl}}/api/faqs/{{faqId}}`
Method: GET
Headers: `Authorization: Bearer {{adminToken}}`

### (Admin) Create FAQ

Endpoint: `{{baseUrl}}/api/faqs`
Method: POST
Headers: `Authorization: Bearer {{adminToken}}`
Body:

```json
{
  "scope": "HOME",
  "question": "How do I redeem a voucher?",
  "answer": "Go to Wallet > Vouchers and enter your code.",
  "is_published": true,
  "sort_order": 1
}
```

### (Admin) Update FAQ

Endpoint: `{{baseUrl}}/api/faqs/{{faqId}}`
Method: PUT
Headers: `Authorization: Bearer {{adminToken}}`
Body:

```json
{
  "answer": "Updated answer text",
  "is_published": true
}
```

### (Admin) Publish/unpublish FAQ

Endpoint: `{{baseUrl}}/api/faqs/{{faqId}}/publish`
Method: PATCH
Headers: `Authorization: Bearer {{adminToken}}`
Body:

```json
{
  "is_published": false
}
```

### (Admin) Reorder FAQs

Endpoint: `{{baseUrl}}/api/faqs/reorder`
Method: POST
Headers: `Authorization: Bearer {{adminToken}}`
Body:

```json
{
  "scope": "HOME",
  "ids": ["{{faqId}}"]
}
```

### (Admin) Delete FAQ

Endpoint: `{{baseUrl}}/api/faqs/{{faqId}}`
Method: DELETE
Headers: `Authorization: Bearer {{adminToken}}`

---