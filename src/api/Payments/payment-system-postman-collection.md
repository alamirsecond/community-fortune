give me this all # Payment System - Postman Collection Documentation

## Base URL
https://your-domain.com/api/v1/payments

text

## Authentication
All endpoints except webhooks require JWT authentication. Include the token in headers:
Authorization: Bearer <your_jwt_token>

text

## Webhooks (No Authentication Required)

### 1. PayPal Webhook
**Endpoint:** `POST /webhook/paypal`

**Headers:**
Content-Type: application/json
PayPal-Transmission-Id: <transmission_id>
PayPal-Transmission-Time: <timestamp>
PayPal-Transmission-Sig: <signature>
PayPal-Cert-Url: <cert_url>
PayPal-Auth-Algo: <algorithm>

text

**Sample Request Body:**
```json
{
  "id": "WH-2WR32451HC0233532-67976317FL4543714",
  "event_version": "1.0",
  "create_time": "2024-01-15T10:00:00Z",
  "resource_type": "capture",
  "resource": {
    "id": "8F148933LY8698354",
    "amount": {
      "currency_code": "GBP",
      "value": "50.00"
    },
    "final_capture": true,
    "seller_protection": {
      "status": "ELIGIBLE"
    },
    "status": "COMPLETED",
    "custom_id": "DEPOSIT_123456"
  },
  "event_type": "PAYMENT.CAPTURE.COMPLETED"
}
2. Stripe Webhook
Endpoint: POST /webhook/stripe

Headers:

text
Content-Type: application/json
Stripe-Signature: t=timestamp,v1=signature
Sample Request Body:

json
{
  "id": "evt_1PABCDEfghijklmnopQRSTUV",
  "object": "event",
  "api_version": "2023-10-16",
  "created": 1673788800,
  "data": {
    "object": {
      "id": "pi_3ABCDEfghijklmnopQRSTUVWX",
      "object": "payment_intent",
      "amount": 5000,
      "amount_capturable": 0,
      "amount_received": 5000,
      "application": null,
      "application_fee_amount": null,
      "metadata": {
        "request_id": "123456",
        "type": "deposit"
      },
      "status": "succeeded"
    }
  },
  "type": "payment_intent.succeeded"
}
3. Revolut Webhook
Endpoint: POST /webhook/revolut

Headers:

text
Content-Type: application/json
Revolut-Signature: t=timestamp,s=signature
Sample Request Body:

json
{
  "id": "evt_9876543210",
  "event": "ORDER_COMPLETED",
  "created_at": "2024-01-15T10:00:00Z",
  "data": {
    "id": "order_123456789",
    "type": "PAYMENT",
    "state": "COMPLETED",
    "amount": 5000,
    "currency": "GBP",
    "metadata": {
      "request_id": "123456",
      "type": "deposit"
    }
  }
}
User Payment Methods
4. Get User Payment Methods
Endpoint: GET /methods

Response:

json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "gateway": "STRIPE",
      "method_type": "CARD",
      "display_name": "Visa **** 4242",
      "last_four": "4242",
      "expiry_month": 12,
      "expiry_year": 2025,
      "card_brand": "VISA",
      "is_default": true,
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}
5. Add Payment Method
Endpoint: POST /methods

Request Body:

json
{
  "gateway": "STRIPE",
  "method_type": "CARD",
  "gateway_account_id": "pm_123456789",
  "display_name": "My Visa Card",
  "last_four": "4242",
  "expiry_month": 12,
  "expiry_year": 2025,
  "card_brand": "VISA",
  "is_default": true
}
Response:

json
{
  "success": true,
  "message": "Payment method added successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "gateway": "STRIPE",
    "method_type": "CARD",
    "display_name": "My Visa Card",
    "last_four": "4242",
    "expiry_month": 12,
    "expiry_year": 2025,
    "card_brand": "VISA",
    "is_default": true,
    "created_at": "2024-01-15T10:00:00Z"
  }
}
6. Set Default Payment Method
Endpoint: POST /methods/{methodId}/default

Response:

json
{
  "success": true,
  "message": "Default payment method set successfully",
  "data": {
    "success": true,
    "message": "Default payment method updated"
  }
}
Deposits
7. Get Enabled Gateways
Endpoint: GET /gateways/enabled?country=GB

Response:

json
{
  "success": true,
  "data": [
    {
      "gateway": "PAYPAL",
      "display_name": "PayPal",
      "min_deposit": 1.00,
      "max_deposit": 5000.00,
      "min_withdrawal": 5.00,
      "max_withdrawal": 10000.00,
      "processing_fee_percent": 2.9,
      "fixed_fee": 0.30,
      "logo_url": "/logos/paypal.png"
    }
  ]
}
8. Create Deposit
Endpoint: POST /deposits

Request Body:

json
{
  "amount": 100.00,
  "gateway": "PAYPAL",
  "wallet_type": "CASH",
  "currency": "GBP",
  "payment_method_id": "550e8400-e29b-41d4-a716-446655440000",
  "return_url": "https://your-domain.com/deposit/success",
  "cancel_url": "https://your-domain.com/deposit/cancel"
}
Response:

json
{
  "success": true,
  "message": "Deposit initiated successfully",
  "data": {
    "paymentId": "660e8400-e29b-41d4-a716-446655440000",
    "requestId": "770e8400-e29b-41d4-a716-446655440000",
    "checkoutUrl": "https://www.paypal.com/checkout/order/123456",
    "paymentIntent": {
      "id": "8F148933LY8698354",
      "status": "CREATED"
    }
  }
}
9. Get User Deposits
Endpoint: GET /deposits?limit=10&offset=0

Response:

json
{
  "success": true,
  "data": {
    "deposits": [
      {
        "id": "770e8400-e29b-41d4-a716-446655440000",
        "gateway": "PAYPAL",
        "amount": 100.00,
        "currency": "GBP",
        "status": "COMPLETED",
        "created_at": "2024-01-15T10:00:00Z",
        "completed_at": "2024-01-15T10:05:00Z"
      }
    ],
    "pagination": {
      "total": 15,
      "limit": 10,
      "offset": 0
    }
  }
}
Withdrawals
10. Create Withdrawal
Endpoint: POST /withdrawals

Request Body:

json
{
  "amount": 50.00,
  "gateway": "PAYPAL",
  "account_details": {
    "receiver_email": "user@example.com",
    "note": "Withdrawal from Community Fortune"
  }
}
Response:

json
{
  "success": true,
  "message": "Withdrawal request submitted successfully",
  "data": {
    "withdrawalId": "880e8400-e29b-41d4-a716-446655440000",
    "requestId": "990e8400-e29b-41d4-a716-446655440000",
    "paymentId": "aa0e8400-e29b-41d4-a716-446655440000",
    "amount": 50.00,
    "feeAmount": 1.75,
    "netAmount": 48.25,
    "status": "PENDING",
    "requiresAdminApproval": true
  }
}
11. Get User Withdrawals
Endpoint: GET /withdrawals?limit=10&offset=0

Response:

json
{
  "success": true,
  "data": {
    "withdrawals": [
      {
        "id": "880e8400-e29b-41d4-a716-446655440000",
        "amount": 50.00,
        "gateway": "PAYPAL",
        "status": "PENDING",
        "created_at": "2024-01-15T10:00:00Z",
        "updated_at": "2024-01-15T10:00:00Z"
      }
    ],
    "pagination": {
      "total": 5,
      "limit": 10,
      "offset": 0
    }
  }
}
Transactions
12. Get User Transactions
Endpoint: GET /transactions?type=deposit&status=completed&limit=10&offset=0

Response:

json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "bb0e8400-e29b-41d4-a716-446655440000",
        "type": "deposit",
        "amount": 100.00,
        "currency": "GBP",
        "status": "completed",
        "gateway": "PAYPAL",
        "description": "Deposit via PayPal",
        "created_at": "2024-01-15T10:00:00Z",
        "completed_at": "2024-01-15T10:05:00Z",
        "reference_table": "payment_requests",
        "reference_id": "770e8400-e29b-41d4-a716-446655440000"
      }
    ],
    "pagination": {
      "total": 25,
      "limit": 10,
      "offset": 0
    }
  }
}
Admin Endpoints
13. Get All Payment Requests (Admin)
Endpoint: GET /requests/all?status=PENDING&limit=20&offset=0

Response:

json
{
  "success": true,
  "data": {
    "requests": [
      {
        "id": "990e8400-e29b-41d4-a716-446655440000",
        "user_id": "110e8400-e29b-41d4-a716-446655440000",
        "type": "WITHDRAWAL",
        "gateway": "PAYPAL",
        "amount": 50.00,
        "currency": "GBP",
        "status": "PENDING",
        "created_at": "2024-01-15T10:00:00Z",
        "requires_admin_approval": true,
        "user_email": "user@example.com",
        "first_name": "John",
        "last_name": "Doe"
      }
    ],
    "pagination": {
      "total": 10,
      "limit": 20,
      "offset": 0
    }
  }
}
14. Approve Payment Request (Admin)
Endpoint: POST /requests/{requestId}/approve

Request Body:

json
{
  "notes": "Verified and approved"
}
Response:

json
{
  "success": true,
  "message": "Payment request approved successfully",
  "data": {
    "success": true,
    "message": "Payment request approved"
  }
}
15. Process Withdrawal (Admin)
Endpoint: POST /withdrawals/{withdrawalId}/process

Request Body:

json
{
  "transaction_reference": "PAYOUT_123456789"
}
Response:

json
{
  "success": true,
  "message": "Withdrawal processed successfully",
  "data": {
    "success": true,
    "withdrawalId": "880e8400-e29b-41d4-a716-446655440000",
    "reference": "PAYOUT_123456789",
    "status": "PROCESSING"
  }
}
16. Refund Transaction (Admin)
Endpoint: POST /transactions/{transactionId}/refund

Request Body:

json
{
  "amount": 100.00,
  "reason": "Customer requested refund"
}
Response:

json
{
  "success": true,
  "message": "Transaction refunded successfully",
  "data": {
    "refundId": "cc0e8400-e29b-41d4-a716-446655440000",
    "amount": 100.00,
    "gatewayRefundId": "ref_123456789",
    "status": "COMPLETED"
  }
}
SuperAdmin Endpoints
17. Get Gateway Configurations (SuperAdmin)
Endpoint: GET /gateways/config

Response:

json
{
  "success": true,
  "data": [
    {
      "id": "dd0e8400-e29b-41d4-a716-446655440000",
      "gateway": "STRIPE",
      "environment": "LIVE",
      "display_name": "Credit/Debit Cards",
      "client_id": "pk_live_123456789",
      "secret_key": "sk_live_987654321",
      "is_enabled": true,
      "min_deposit": 1.00,
      "max_deposit": 5000.00,
      "min_withdrawal": 5.00,
      "max_withdrawal": 10000.00,
      "processing_fee_percent": 2.9,
      "fixed_fee": 0.30,
      "allowed_countries": ["GB", "US", "CA"],
      "restricted_countries": [],
      "sort_order": 1,
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-01-15T10:00:00Z"
    }
  ]
}
18. Update Gateway Configuration (SuperAdmin)
Endpoint: POST /gateways/config

Request Body:

json
{
  "id": "dd0e8400-e29b-41d4-a716-446655440000",
  "is_enabled": true,
  "processing_fee_percent": 2.9,
  "fixed_fee": 0.30,
  "min_deposit": 5.00,
  "max_deposit": 10000.00,
  "allowed_countries": ["GB", "US", "CA", "AU"],
  "restricted_countries": []
}
19. Test Gateway Connection (SuperAdmin)
Endpoint: POST /gateways/PAYPAL/test?environment=LIVE

Response:

json
{
  "success": true,
  "data": {
    "success": true,
    "message": "PayPal connection successful"
  }
}
Reports
20. Daily Report
Endpoint: GET /reports/daily?date=2024-01-15

Response:

json
{
  "success": true,
  "data": {
    "date": "2024-01-15",
    "deposits": [
      {
        "count": 5,
        "total_amount": 1500.00,
        "average_amount": 300.00,
        "gateway": "PAYPAL"
      }
    ],
    "withdrawals": [
      {
        "count": 3,
        "total_amount": 450.00,
        "average_amount": 150.00,
        "gateway": "STRIPE"
      }
    ],
    "fees": [
      {
        "total_fees": 45.00,
        "gateway": "PAYPAL"
      }
    ],
    "new_users": 12
  }
}
21. Gateway Report
Endpoint: GET /reports/gateway?start_date=2024-01-01&end_date=2024-01-31

Response:

json
{
  "success": true,
  "data": {
    "period": {
      "start_date": "2024-01-01",
      "end_date": "2024-01-31"
    },
    "gateway_stats": [
      {
        "gateway": "PAYPAL",
        "deposit_count": 150,
        "deposit_amount": 45000.00,
        "withdrawal_count": 45,
        "withdrawal_amount": 13500.00,
        "avg_deposit": 300.00,
        "avg_withdrawal": 300.00,
        "total_fees": 1305.00,
        "unique_users": 89
      }
    ],
    "success_rates": [
      {
        "gateway": "PAYPAL",
        "total_requests": 195,
        "completed": 185,
        "failed": 5,
        "cancelled": 5
      }
    ]
  }
}
Subscription & Tickets
22. Process Subscription Payment
Endpoint: POST /subscriptions

Request Body:

json
{
  "tier_id": "ee0e8400-e29b-41d4-a716-446655440000",
  "payment_method_id": "550e8400-e29b-41d4-a716-446655440000"
}
23. Purchase Tickets
Endpoint: POST /tickets/purchase

Request Body:

json
{
  "competition_id": "ff0e8400-e29b-41d4-a716-446655440000",
  "ticket_count": 5,
  "payment_method": "CASH_WALLET",
  "use_universal_tickets": 2
}
Error Responses
400 Bad Request
json
{
  "success": false,
  "error": "Amount must be between 10.00 and 5000.00"
}
401 Unauthorized
json
{
  "success": false,
  "error": "Authentication required"
}
403 Forbidden
json
{
  "success": false,
  "error": "Insufficient permissions"
}
404 Not Found
json
{
  "success": false,
  "error": "Resource not found"
}
500 Internal Server Error
json
{
  "success": false,
  "error": "Internal server error"
}
