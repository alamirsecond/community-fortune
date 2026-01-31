# Payment System API Documentation
# Overview
# This API provides a comprehensive payment system with support for multiple gateways (PayPal, Stripe, Revolut), user payment methods management, deposits, withdrawals, transactions, and administrative functions.

# Base URL
# text

# 1. Webhook Endpoints
# These endpoints are for payment gateway webhooks and don't require authentication.

# PayPal Webhook
# http
# POST /webhook/paypal
# Request Body:

```json
{
  "event_type": "PAYMENT.CAPTURE.COMPLETED",
  "resource": {
    "id": "capture_id",
    "custom_id": "DEPOSIT_123456",
    "amount": {
      "value": "100.00",
      "currency_code": "GBP"
    }
  }
}
```
# Stripe Webhook
# http
# POST /webhook/stripe
# Request Body:

```json
{
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_123456",
      "amount": 10000,
      "currency": "gbp",
      "metadata": {
        "request_id": "123456"
      }
    }
  }
}
```
# Revolut Webhook
# http
# POST /webhook/revolut
# Request Body:

```json
{
  "event": "ORDER_COMPLETED",
  "data": {
    "id": "order_123",
    "amount": 10000,
    "currency": "GBP",
    "metadata": {
      "request_id": "123456"
    }
  }
} 
```
# 2. Get Enabled Gateways
http
# GET /gateways/enabled
Query Parameters:


# Response:

```json
{
  "success": true,
  "data": [
    {
      "gateway": "PAYPAL",
      "display_name": "PayPal",
      "min_deposit": 5,
      "max_deposit": 10000,
      "min_withdrawal": 10,
      "max_withdrawal": 5000,
      "processing_fee_percent": 2.9,
      "fixed_fee": 0.3,
      "logo_url": "https://example.com/logos/paypal.png"
    }
  ]
} 
```
User Endpoints (Requires USER role)
Payment Methods
# 1. Get User Payment Methods
http
# GET /methods
Response:

``` json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "gateway": "STRIPE",
      "method_type": "CARD",
      "display_name": "Visa ending in 4242",
      "last_four": "4242",
      "expiry_month": 12,
      "expiry_year": 2025,
      "card_brand": "VISA",
      "is_default": true,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
} 
```
#  2. Add Payment Method
http
#  POST /methods
Request Body:

```json
{
  "gateway": "STRIPE",
  "method_type": "CARD",
  "gateway_account_id": "pm_123456",
  "display_name": "Visa ending in 4242",
  "last_four": "4242",
  "expiry_month": 12,
  "expiry_year": 2025,
  "card_brand": "VISA",
  "is_default": false,
  "metadata": {
    "fingerprint": "abc123"
  }
}
```
#  Response:

```json
{
  "success": true,
  "message": "Payment method added successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "gateway": "STRIPE",
    "method_type": "CARD",
    "display_name": "Visa ending in 4242",
    "last_four": "4242",
    "is_default": false
  }
}
```
#  3. Update Payment Method
http
# PUT /methods/:methodId
Request Body:

``` json
{
  "display_name": "Updated Visa Card",
  "is_default": true
}
```
#  4. Remove Payment Method
http
#  DELETE /methods/:methodId
Response:

```json
{
  "success": true,
  "message": "Payment method removed successfully"
}
```
#  5. Set Default Payment Method
http
#  POST /methods/:methodId/default
Deposits
#  1. Get User Deposits
http
#  GET /deposits?limit=20&offset=0
Response:

```json
{
  "success": true,
  "data": {
    "deposits": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "gateway": "PAYPAL",
        "amount": 100.00,
        "currency": "GBP",
        "status": "COMPLETED",
        "created_at": "2024-01-15T10:30:00Z",
        "completed_at": "2024-01-15T10:31:00Z"
      }
    ],
    "pagination": {
      "total": 15,
      "limit": 20,
      "offset": 0
    }
  }
}
```
# 2. Create Deposit
http
#  POST /deposits
Request Body:

```json
{
  "amount": 100.00,
  "gateway": "PAYPAL",
  "wallet_type": "CASH",
  "currency": "GBP",
  "payment_method_id": "pm_123456",
  "return_url": "https://frontend.com/success",
  "cancel_url": "https://frontend.com/cancel"
}
```
Response:

```json
{
  "success": true,
  "message": "Deposit initiated successfully",
  "data": {
    "paymentId": "550e8400-e29b-41d4-a716-446655440000",
    "requestId": "660e8400-e29b-41d4-a716-446655440000",
    "checkoutUrl": "https://paypal.com/checkout/123",
    "paymentIntent": {
      "client_secret": "pi_123_secret_456",
      "id": "pi_123456"
    }
  }
}
```
#  3. Get Deposit Details
http
# GET /deposits/:depositId
Response:

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "DEPOSIT",
    "gateway": "PAYPAL",
    "amount": 100.00,
    "currency": "GBP",
    "fee_amount": 3.20,
    "net_amount": 96.80,
    "status": "COMPLETED",
    "deposit_to_wallet": "CASH",
    "created_at": "2024-01-15T10:30:00Z",
    "completed_at": "2024-01-15T10:31:00Z",
    "gateway_order_id": "ORDER-123456",
    "gateway_response": {
      "id": "ORDER-123456",
      "status": "COMPLETED"
    }
  }
}
```
# 4. Cancel Deposit
http
# POST /deposits/:depositId/cancel
#  5. Retry Deposit
http
#  POST /deposits/:depositId/retry



# Withdrawals API Documentation
# Overview
# The withdrawals API allows users to request cash withdrawals from their wallet balance, and administrators to manage those withdrawal requests. The system supports multiple withdrawal gateways including PayPal, Bank Transfer, and Revolut.

# User Endpoints (Requires USER role)
# 1. Get User Withdrawals
# Retrieves a paginated list of the authenticated user's withdrawal requests.

# http
# GET /withdrawals
# Query Parameters
# Parameter	Type	Required	Description	Default	Constraints
# limit	integer	No	Number of records per page	50	1-100
# offset	integer	No	Starting position for pagination	0	>= 0
# Response (200 OK)
```json
{
  "success": true,
  "data": {
    "withdrawals": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "amount": 50.00,
        "gateway": "PAYPAL",
        "status": "PENDING",
        "created_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-15T10:30:00Z"
      },
      {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "amount": 100.00,
        "gateway": "BANK_TRANSFER",
        "status": "COMPLETED",
        "created_at": "2024-01-14T14:20:00Z",
        "updated_at": "2024-01-14T15:30:00Z"
      }
    ],
    "pagination": {
      "total": 15,
      "limit": 50,
      "offset": 0
    }
  }
}
```
# Withdrawal Status Values
# PENDING: Request submitted, awaiting admin approval/processing

# PROCESSING: Approved and being processed via gateway

# COMPLETED: Successfully processed and funds sent

# CANCELLED: Cancelled by user before processing

# REJECTED: Rejected by admin

# FAILED: Gateway processing failed

# Error Responses
``` json
{
  "success": false,
  "error": "Internal server error"
}
```
# 2. Create Withdrawal
# Submits a new withdrawal request. Funds are immediately held from the user's wallet balance.

# http
# POST /withdrawals
# Request Body Schema
# The request body varies based on the selected gateway:

# Common Fields:

```json
{
  "amount": 50.00,
  "gateway": "PAYPAL",
  "account_details": {
    // Gateway-specific details (see below)
  }
}
```
# Gateway-Specific Account Details
# PayPal:

```json
{
  "amount": 50.00,
  "gateway": "PAYPAL",
  "account_details": {
    "receiver_email": "user@example.com",
    "note": "Withdrawal from winnings"
  }
}
```
# Bank Transfer:

```json
{
  "amount": 100.00,
  "gateway": "BANK_TRANSFER",
  "account_details": {
    "account_holder_name": "John Doe",
    "account_number": "12345678",
    "sort_code": "040004",
    "bank_name": "HSBC",
    "reference": "Withdrawal Jan 2024"
  }
}
```
# Revolut:

```json
{
  "amount": 75.00,
  "gateway": "REVOLUT",
  "account_details": {
    "receiver_email": "user@example.com",
    "phone": "+447123456789",
    "name": "John Doe",
    "profile_type": "personal"
  }
}
```
# Validation Rules
# Field	Validation	Error Message
# amount	Float between 10 and 50000	"Amount must be between 10 and 50,000"
# gateway	Must be: PAYPAL, BANK_TRANSFER, REVOLUT	"Invalid withdrawal gateway"
# account_details	Must be an object	"Account details must be an object"
# account_details.receiver_email (PayPal)	Valid email when gateway is PAYPAL	"Valid email required for PayPal"
# account_details.account_holder_name (Bank Transfer)	Required when gateway is BANK_TRANSFER	"Account holder name required for bank transfer"
# account_details.account_number (Bank Transfer)	Required when gateway is BANK_TRANSFER	"Account number required for bank transfer"
# account_details.sort_code (Bank Transfer)	6 digits when gateway is BANK_TRANSFER	"Valid sort code required (6 digits)"
# Response (201 Created)
```json
{
  "success": true,
  "message": "Withdrawal request submitted successfully",
  "data": {
    "withdrawalId": "550e8400-e29b-41d4-a716-446655440000",
    "requestId": "660e8400-e29b-41d4-a716-446655440001",
    "paymentId": "770e8400-e29b-41d4-a716-446655440002",
    "amount": 50.00,
    "feeAmount": 1.45,
    "netAmount": 48.55,
    "status": "PENDING",
    "requiresAdminApproval": true,
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```
# Business Logic
# Balance Check: Verifies user has sufficient funds in CASH wallet

# Gateway Validation: Checks if selected gateway is enabled and available

# Amount Limits: Validates amount against gateway min/max limits and user transaction limits

# Fee Calculation: Calculates processing fees based on gateway configuration

# Funds Hold: Immediately holds the amount from user's wallet

# Records Creation: Creates withdrawal, payment request, payment, and transaction records

# Status: All withdrawals require admin approval by default

# Error Responses
```json
{
  "success": false,
  "errors": [
    {
      "msg": "Amount must be between 10 and 50,000",
      "param": "amount",
      "location": "body"
    }
  ]
}
json
{
  "success": false,
  "error": "Insufficient funds"
}
```
# 3. Get Withdrawal Details
# Retrieves detailed information about a specific withdrawal request.

# http
# GET /withdrawals/:withdrawalId
# Path Parameters
# Parameter	Type	Required	Description
# withdrawalId	string	Yes	UUID of the withdrawal
# Response (200 OK)
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "amount": 50.00,
    "gateway": "PAYPAL",
    "account_details": {
      "receiver_email": "user@example.com",
      "note": "Withdrawal from winnings"
    },
    "status": "PENDING",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z",
    "admin_notes": null,
    "fee_amount": 1.45,
    "net_amount": 48.55,
    "gateway_payment_id": null
  }
}
```
# Error Responses
```json
{
  "success": false,
  "error": "Withdrawal not found"
}
```
# 4. Cancel Withdrawal
# Allows users to cancel a pending withdrawal request. Funds are released back to the user's wallet.

# http
# POST /withdrawals/:withdrawalId/cancel
# Path Parameters
# Parameter	Type	Required	Description
# withdrawalId	string	Yes	UUID of the withdrawal
# Response (200 OK)
```json
{
  "success": true,
  "message": "Withdrawal cancelled successfully",
  "data": {
    "withdrawalId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "CANCELLED",
    "fundsReleased": true
  }
}
```
 # Business Rules
# Only withdrawals with status "PENDING" can be cancelled

# Once processed (PROCESSING, COMPLETED) or rejected, cannot be cancelled

# Funds are immediately released back to user's CASH wallet

# Associated payment request, payment, and transaction records are updated to CANCELLED status

# Error Responses
```json
{
  "success": false,
  "error": "Withdrawal not found or cannot be cancelled"
}
```
# Admin Endpoints (Requires ADMIN or SUPERADMIN role)
# 5. Get All Withdrawals
# Retrieves all withdrawal requests with filtering and pagination capabilities for administrators.

# http
# GET /withdrawals/all
# Query Parameters
# Parameter	Type	Required	Description	Example
# limit	integer	No	Records per page	50
# offset	integer	No	Pagination offset	0
# status	string	No	Filter by status	PENDING, PROCESSING, COMPLETED
# gateway	string	No	Filter by payment gateway	PAYPAL, BANK_TRANSFER
# startDate	string	No	Filter from date (YYYY-MM-DD)	2024-01-01
# endDate	string	No	Filter to date (YYYY-MM-DD)	2024-01-31
# Response (200 OK)
```json
{
  "success": true,
  "data": {
    "withdrawals": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "user_id": "aa0e8400-e29b-41d4-a716-446655440000",
        "amount": 50.00,
        "gateway": "PAYPAL",
        "status": "PENDING",
        "created_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-15T10:30:00Z",
        "admin_notes": null,
        "gateway_reference": null,
        "user_email": "user@example.com",
        "first_name": "John",
        "last_name": "Doe"
      }
    ],
    "pagination": {
      "total": 125,
      "limit": 50,
      "offset": 0
    }
  }
}
```
# 6. Process Withdrawal
# Administrator endpoint to process a pending withdrawal request through the payment gateway.

# http
# POST /withdrawals/:withdrawalId/process
# Path Parameters
# Parameter	Type	Required	Description
# withdrawalId	string	Yes	UUID of the withdrawal
# Request Body
```json
{
  "transaction_reference": "PAYOUT-123456"
}
```
# Response (200 OK)
```json
{
  "success": true,
  "message": "Withdrawal processed successfully",
  "data": {
    "withdrawalId": "550e8400-e29b-41d4-a716-446655440000",
    "reference": "PAYOUT-123456",
    "status": "PROCESSING",
    "gatewayResult": {
      "success": true,
      "reference": "PAYOUT-123456",
      "batch_status": "PENDING",
      "response": {
        "batch_header": {
          "payout_batch_id": "PAYOUT-123456",
          "batch_status": "PENDING"
        }
      }
    }
  }
}
```
# Business Logic
# Validation: Checks withdrawal exists and is in PENDING status

# Account Details: Parses stored account details for the selected gateway

# Gateway Processing: Calls appropriate gateway API (PayPal, Stripe, Revolut, Bank Transfer)

# Status Update: Updates withdrawal status to PROCESSING

# Reference Storage: Stores gateway reference/transaction ID

# Audit Log: Creates admin activity log entry

# Gateway Processing Details
# PayPal Payout:

# Uses PayPal Payouts API for business accounts

# For personal accounts, uses PayPal Payments API

# Returns payout batch ID as reference

# Supports both business and personal PayPal accounts

# Stripe Payout:

# Can payout to connected Stripe accounts (for platforms)

# Can transfer to customer's bank accounts

# Supports instant, standard, or ACH transfer methods

# Returns payout or transfer ID as reference

# Revolut Payment:

# Creates counterparty if not exists

# Initiates payment to Revolut account

# May require approval depending on account settings

# Returns payment ID and leg ID as references

# Bank Transfer:

# Manual processing (no API call)

# Admin provides transaction reference manually

# Status updated to PROCESSING for manual completion

# Error Responses
```json
{
  "success": false,
  "error": "Withdrawal not found or already processed"
}
json
{
  "success": false,
  "error": "Gateway error: Invalid PayPal email"
}
```
# 7. Reject Withdrawal
# Administrator endpoint to reject a pending withdrawal request. Funds are released back to user's wallet.

# http
# POST /withdrawals/:withdrawalId/reject
# Path Parameters
# Parameter	Type	Required	Description
# withdrawalId	string	Yes	UUID of the withdrawal
# Request Body
```json
{
  "reason": "Insufficient verification documents provided"
}
```
# Response (200 OK)
```json
{
  "success": true,
  "message": "Withdrawal rejected successfully",
  "data": {
    "withdrawalId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "REJECTED",
    "fundsReleased": true,
    "adminNotes": "[2024-01-15T10:35:00Z] Rejected by admin 550e8400: Insufficient verification documents provided"
  }
}
```
# Business Logic
# Validation: Checks withdrawal exists and is in PENDING status

# Status Update: Updates withdrawal status to REJECTED

# Funds Release: Releases held funds back to user's CASH wallet

# Record Updates: Updates all associated records (payment request, payment, transactions)

# Admin Notes: Appends rejection reason with timestamp to admin notes

# Audit Log: Creates admin activity log entry

# Error Responses
```json
{
  "success": false,
  "error": "Reason is required for rejection"
}
json
{
  "success": false,
  "error": "Withdrawal not found or already processed"
}
```



# Transaction Management API Documentation
# Overview
# The Transaction Management API provides comprehensive tools for administrators to monitor, analyze, and manage all financial transactions across the platform. It includes analytics dashboards, detailed transaction views, and powerful filtering capabilities.

# Table of Contents
# Authentication & Authorization

# Analytics Dashboard Endpoint

# Transaction List Endpoint

# Transaction Details Endpoint

# Error Handling

# Database Schema Reference

# Testing Examples

# Authentication & Authorization
# All endpoints require authentication with JWT tokens. Different endpoints have different authorization levels:


# 1. Get Transaction Analytics
# Retrieves comprehensive analytics data for the admin dashboard with period-based filtering.

# http
# GET /transactions/analytics
# Query Parameters
# Parameter	Type	Required	Default	Description	Example Values
# period	string	No	this_week	Time period for analytics	today, this_week, this_month, last_week, last_month, custom
# startDate	string	No*	-	Start date (YYYY-MM-DD)	2024-01-01
# endDate	string	No*	-	End date (YYYY-MM-DD)	2024-01-31
# * Required when period is set to custom

# Response (200 OK)
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_deposits": {
        "amount": 127450.00,
        "count": 285,
        "currency": "₹",
        "change_percentage": 12,
        "change_label": "+12% this week",
        "trend": "up"
      },
      "total_withdrawals": {
        "amount": 43290.00,
        "count": 124,
        "currency": "₹",
        "change_percentage": -5,
        "change_label": "-5% vs last week",
        "trend": "down"
      },
      "competition_entries": {
        "count": 247,
        "amount": 24700.00,
        "change_percentage": 18,
        "change_label": "+18% vs last week",
        "trend": "up"
      },
      "net_revenue": {
        "amount": 121500.00,
        "currency": "₹",
        "profit_margin": 25.4,
        "change_label": "+25.4% profit margin",
        "trend": "up"
      },
      "today_activity": {
        "amount": 12450.00,
        "count": 48,
        "change_percentage": 8.5,
        "change_label": "+8.5% vs yesterday"
      },
      "pending_withdrawals": {
        "count": 12,
        "total_amount": 8450.00,
        "label": "₹8,450 in queue"
      },
      "avg_transaction_value": {
        "amount": 34.50,
        "count": 658,
        "change_percentage": 2.3,
        "change_label": "+2.3% vs last month"
      }
    },
    "period": {
      "start": "2024-01-08T00:00:00.000Z",
      "end": "2024-01-15T23:59:59.999Z",
      "label": "This Week"
    }
  }
}
```
# Analytics Metrics Explained
# Total Deposits
# Amount: Sum of all completed deposit transactions

# Count: Number of deposit transactions

# Currency: Currency symbol (₹, £, $, €)

# Change Percentage: Percentage change vs previous period

# Trend: Direction of change (up/down)

# Total Withdrawals
# Amount: Sum of all completed withdrawal transactions

# Count: Number of withdrawal transactions

# Trend: Shows cash outflow trends

# Competition Entries
# Count: Number of competition entry transactions

# Amount: Total revenue from competition entries

# Change: Growth in participation rate

# Net Revenue
# Calculation: (Deposits + Competition Entries) - Withdrawals

# Profit Margin: (Net Revenue / Deposits) * 100

# Trend: Overall profitability indicator

# 2. Get All Transactions
# Retrieves paginated list of all transactions with advanced filtering options.

# http
# GET /transactions/all

# Response (200 OK)
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "user_id": "aa0e8400-e29b-41d4-a716-446655440001",
        "user_email": "sarah.j@example.com",
        "user_name": "Sarah Johnson",
        "type": "deposit",
        "amount": 50.00,
        "currency": "GBP",
        "status": "completed",
        "gateway": "STRIPE",
        "description": "Deposit via VISA ending in 5678",
        "created_at": "2024-01-15T10:30:00Z",
        "completed_at": "2024-01-15T10:31:00Z"
      },
      {
        "id": "660e8400-e29b-41d4-a716-446655440002",
        "user_id": "bb0e8400-e29b-41d4-a716-446655440003",
        "user_email": "john.d@example.com",
        "user_name": "John Doe",
        "type": "withdrawal",
        "amount": 100.00,
        "currency": "GBP",
        "status": "pending",
        "gateway": "PAYPAL",
        "description": "Withdrawal to PayPal account",
        "created_at": "2024-01-15T09:15:00Z",
        "completed_at": null
      },
      {
        "id": "770e8400-e29b-41d4-a716-446655440004",
        "user_id": "cc0e8400-e29b-41d4-a716-446655440005",
        "user_email": "mike.s@example.com",
        "user_name": "Mike Smith",
        "type": "competition_entry",
        "amount": 10.00,
        "currency": "GBP",
        "status": "completed",
        "gateway": "STRIPE",
        "description": "Entry to Weekly Poker Tournament",
        "created_at": "2024-01-15T08:45:00Z",
        "completed_at": "2024-01-15T08:46:00Z"
      }
    ],
    "pagination": {
      "total": 1250,
      "limit": 50,
      "offset": 0,
      "total_pages": 25,
      "current_page": 1
    },
    "filters_applied": {
      "date_range": {
        "from": "2024-01-01",
        "to": "2024-01-15"
      },
      "type": "all",
      "status": "all",
      "gateway": "all"
    },
    "summary": {
      "total_amount": 125450.00,
      "average_amount": 100.36,
      "transaction_count": 1250
    }
  }
}
```

# 3. Get Transaction Details
# Retrieves comprehensive details for a specific transaction, including user information, payment details, and action history.

http
# GET /transactions/:transactionId/details

# transactionId	string	Yes	UUID of the transaction	550e8400-e29b-41d4-a716-446655440000
# Response (200 OK)
```json
{
  "success": true,
  "data": {
    "transaction": {
      "id": "TXN-8B9C2A1F",
      "transaction_amount": 50.00,
      "currency": "GBP",
      "type": "deposit",
      "status": "completed",
      "created_at": "2024-01-15T10:30:00Z",
      "completed_at": "2024-01-15T10:31:00Z",
      "gateway": "STRIPE",
      "gateway_reference": "ch_1MqKXb2eZvKYlo2C5Kq12345",
      "description": "Deposit to CASH wallet",
      "wallet_type": "CASH"
    },
    "user_information": {
      "full_name": "Sarah Michelle Johnson",
      "email_address": "sarah.j@example.com",
      "user_id": "USR-2024-00456",
      "account_status": "Active & Verified",
      "join_date": "2023-11-15T14:20:00Z",
      "total_transactions": 42,
      "total_deposits": 1250.00,
      "total_withdrawals": 450.00,
      "current_balance": 800.00,
      "profile_completion": 95
    },
    "payment_details": {
      "payment_method": "VISA ending in 5678",
      "card_brand": "VISA",
      "last_four": "5678",
      "expiry": "12/2025",
      "processing_fee": 1.50,
      "fee_percentage": 3.0,
      "card_holder": "Sarah M Johnson",
      "net_amount": 48.50,
      "gateway_fee": 1.45,
      "platform_fee": 0.05,
      "wallet_credited": "CASH",
      "new_balance": 548.50
    },
    "refund_history": [
      {
        "refund_id": "REF-123456",
        "amount": 25.00,
        "currency": "GBP",
        "reason": "Partial refund - user request",
        "status": "completed",
        "created_at": "2024-01-16T14:20:00Z",
        "admin_name": "John Admin",
        "gateway_refund_id": "re_3MqKXb2eZvKYlo2C5Kq67890"
      }
    ],
    "internal_notes": [
      {
        "note_id": "NOTE-001",
        "content": "User contacted regarding duplicate charge. Verified and processed partial refund.",
        "admin_name": "Jane Supervisor",
        "created_at": "2024-01-16T10:15:00Z",
        "visibility": "admin_only"
      },
      {
        "note_id": "NOTE-002",
        "content": "User verified KYC status - all documents approved.",
        "admin_name": "Support Agent",
        "created_at": "2024-01-15T11:30:00Z",
        "visibility": "admin_only"
      }
    ],
    "related_transactions": [
      {
        "id": "TXN-9A8B7C6D",
        "type": "competition_entry",
        "amount": 20.00,
        "status": "completed",
        "created_at": "2024-01-15T11:45:00Z",
        "description": "Weekly Poker Tournament Entry"
      }
    ],
    "available_actions": {
      "can_refund": true,
      "can_download_receipt": true,
      "can_email_user": true,
      "can_add_note": true,
      "can_view_user": true,
      "can_export_details": true,
      "can_view_receipt": true,
      "refund_max_amount": 50.00,
      "refund_min_amount": 0.50
    },
    "timeline": [
      {
        "timestamp": "2024-01-15T10:30:00Z",
        "action": "transaction_created",
        "description": "Transaction initiated by user",
        "status": "pending"
      },
      {
        "timestamp": "2024-01-15T10:30:15Z",
        "action": "payment_processed",
        "description": "Payment authorized by Stripe",
        "status": "processing"
      },
      {
        "timestamp": "2024-01-15T10:31:00Z",
        "action": "transaction_completed",
        "description": "Funds credited to user wallet",
        "status": "completed"
      }
    ]
  }
}
```





Payment Requests
#  1. Get User Payment Requests
http
GET /requests?limit=20&offset=0
#  2. Get Payment Request Details
http
#  GET /requests/:requestId
Admin Endpoints (Requires ADMIN or SUPERADMIN role)
#  Payment Requests (Admin)
#  1. Get All Payment Requests
http
#  GET /requests/all?limit=20&offset=0&type=WITHDRAWAL&status=PENDING
#  2. Approve Payment Request
http
#  POST /requests/:requestId/approve
Request Body:

```json
{
  "notes": "Approved after verification"
}
```
#  3. Reject Payment Request
http
#  POST /requests/:requestId/reject
#  Request Body:

```json
{
  "reason": "Insufficient verification documents provided"
}
```
#  4. Complete Payment Request
http
# POST /requests/:requestId/complete
Request Body:

```json
{
  "gateway_reference": "PAYOUT-123456"
}
```
# 5. Refund Payment
http
# POST /requests/:requestId/refund
Request Body:

```json
{
  "amount": 50.00,
  "reason": "Customer requested refund due to technical issues"
}
```
Transactions (Admin)
 # 1. Get All Transactions
http
# GET /transactions/all?limit=20&offset=0&gateway=PAYPAL&startDate=2024-01-01
# 2. Refund Transaction
http
# POST /transactions/:transactionId/refund
#  Withdrawals (Admin)
# 1. Get All Withdrawals
http
# GET /withdrawals/all?limit=20&offset=0&status=PENDING
# 2. Process Withdrawal
http
# POST /withdrawals/:withdrawalId/process
Request Body:

```json
{
  "transaction_reference": "TRANS-123456"
}
```
# 3. Reject Withdrawal
#  http
# POST /withdrawals/:withdrawalId/reject
Reports
#  1. Get Daily Report
http
#  GET /reports/daily?date=2024-01-15
# 2. Get Monthly Report
http
#  GET /reports/monthly?year=2024&month=1
#  3. Get Gateway Report
http
# GET /reports/gateway?start_date=2024-01-01&end_date=2024-01-31
#  SuperAdmin Endpoints (Requires SUPERADMIN role)
Gateway Configuration
#  1. Get Gateway Configurations
http
#  GET /gateways/config
Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "gateway": "STRIPE",
      "environment": "LIVE",
      "display_name": "Stripe",
      "client_id": "ca_123456",
      "api_key": "sk_live_123456",
      "webhook_secret": "whsec_123456",
      "is_enabled": true,
      "min_deposit": 5,
      "max_deposit": 10000,
      "min_withdrawal": 10,
      "max_withdrawal": 5000,
      "processing_fee_percent": 2.9,
      "fixed_fee": 0.3,
      "allowed_countries": ["GB", "US", "CA"],
      "restricted_countries": [],
      "logo_url": "https://example.com/logos/stripe.png"
    }
  ]
}
```
#  2. Update Gateway Configuration
http
#  POST /gateways/config
Request Body:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "is_enabled": true,
  "min_deposit": 10,
  "max_deposit": 5000,
  "processing_fee_percent": 2.5,
  "allowed_countries": ["GB", "US", "CA", "AU"]
}
```
# 3. Test Gateway Connection
http
# POST /gateways/:gateway/test?environment=LIVE
# Payment Settings
# 1. Get Payment Settings
http
# GET /settings
# 2. Update Payment Settings
http
POST /settings
Request Body:

```json
{
  "withdrawal_approval_required": true,
  "min_withdrawal_amount": 10,
  "max_withdrawal_amount": 5000,
  "daily_withdrawal_limit": 1000,
  "deposit_fee_percent": 0,
  "withdrawal_fee_percent": 2.5
}
```
# Competition System Integration
Subscription & Tickets
# 1. Process Subscription Payment
http
# POST /subscriptions
Request Body:

```json
{
  "tier_id": "550e8400-e29b-41d4-a716-446655440000",
  "payment_method_id": "pm_123456"
}
```
# 2. Purchase Tickets
http
# POST /tickets/purchase
Request Body:

```json
{
  "competition_id": "550e8400-e29b-41d4-a716-446655440000",
  "quantity": 5,
  "payment_method_id": "pm_123456",
  "auto_enter": true
}
```
# 3. Get User Subscriptions
http
# GET /subscriptions/user
Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "tier_id": "660e8400-e29b-41d4-a716-446655440000",
      "tier_name": "Premium",
      "status": "ACTIVE",
      "start_date": "2024-01-01T00:00:00Z",
      "end_date": "2024-02-01T00:00:00Z",
      "renewal_date": "2024-02-01T00:00:00Z",
      "amount": 19.99,
      "currency": "GBP"
    }
  ]
}
```
# 4. Get User Tickets
http
# GET /tickets/user?competition_id=550e8400-e29b-41d4-a716-446655440000
Query Parameters:

competition_id (optional): Filter by competition

status (optional): Filter by ticket status

page (optional): Page number

limit (optional): Items per page

# 5. Get Subscription Tiers
http
# GET /subscriptions/tiers
Error Responses
All endpoints return consistent error responses:

# Validation Error (400)
```json
{
  "success": false,
  "errors": [
    {
      "msg": "Amount must be between 1 and 100,000",
      "param": "amount",
      "location": "body"
    }
  ]
}
```
# Authentication Error (401)
```json
{
  "success": false,
  "error": "Authentication required"
}
```
# Authorization Error (403)
```json
{
  "success": false,
  "error": "Insufficient permissions"
}
Not Found Error (404)
json
{
  "success": false,
  "error": "Resource not found"
}
Server Error (500)
json
{
  "success": false,
  "error": "Internal server error"
}
```