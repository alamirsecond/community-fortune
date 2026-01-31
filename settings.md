# Admin Settings API Documentation
# Overview
# The Admin Settings API provides comprehensive system configuration management for administrators and superadmins. This API handles password management, maintenance mode controls, payment gateway configurations, and transaction limits settings.

# Table of Contents
# Authentication & Authorization

# Password Settings

# Maintenance Mode

# Payment Gateway Management

# Transaction Limits

# Error Handling

# Validation Schemas

# Database Schema

# Testing Examples

# Authentication & Authorization
# All endpoints require SUPERADMIN or ADMIN role authentication:

http
# Authorization: Bearer <your_jwt_token>
Required Roles:

# 1. Change Admin Password
# Allows administrators to change their own password with security validation.

http
# POST /settings/password/change
Request Body
```json
{
  "oldPassword": "currentPassword123",
  "newPassword": "NewSecurePassword456!",
  "confirmNewPassword": "NewSecurePassword456!"
}
```
Validation Rules
# Field	Type	Required	Validation	Error Message
# oldPassword	string	Yes	Current admin password	"Current password is incorrect"
# newPassword	string	Yes	Min 8 characters	"Password must be at least 8 characters long"
# confirmNewPassword	string	Yes	Must match newPassword	"New passwords do not match"
Response (200 OK)
```json
{
  "success": true,
  "message": "Password changed successfully"
}
Response (400 Bad Request)
json
{
  "success": false,
  "message": "Current password is incorrect"
}
```

# 2. Maintenance Mode Management
# 2.1 Get Maintenance Settings
# Retrieves current maintenance mode configuration.

http
# GET /settings/maintenance
Response (200 OK)
```json
{
  "success": true,
  "data": {
    "maintenance_mode": false,
    "allowed_ips": ["192.168.1.1", "10.0.0.1"],
    "maintenance_message": "System is under maintenance. Please try again later.",
    "estimated_duration": "2 hours"
  }
}
```
2.2 Update Maintenance Settings
# Updates maintenance mode configuration.

http
# POST /settings/maintenance
Request Body
```json
{
  "maintenance_mode": true,
  "allowed_ips": ["192.168.1.1", "10.0.0.1", "203.0.113.5"],
  "maintenance_message": "System undergoing scheduled maintenance. We'll be back by 6 PM GMT.",
  "estimated_duration": "3 hours"
}
```

# Response (200 OK)
```json
{
  "success": true,
  "message": "Maintenance settings updated successfully",
  "data": {
    "maintenance_mode": true,
    "allowed_ips": ["192.168.1.1", "10.0.0.1", "203.0.113.5"],
    "maintenance_message": "System undergoing scheduled maintenance. We'll be back by 6 PM GMT.",
    "estimated_duration": "3 hours"
  }
}
```


# 3. Payment Gateway Management
# 3.1 Get Payment Gateways (Enabled)
# Retrieves list of currently enabled payment methods.

http
# GET /settings/payment-gateways
Response (200 OK)
```json
{
  "success": true,
  "data": {
    "enabled_methods": ["credit_debit_card", "paypal", "bank_transfer", "revolut"],
    "display_names": {
      "credit_debit_card": "Credit/Debit Cards (Visa, Mastercard, Amex)",
      "paypal": "PayPal",
      "bank_transfer": "Bank Transfer",
      "revolut": "Revolut"
    }
  }
}
```
# 3.2 Get All Payment Gateways
Retrieves detailed configuration for all payment gateways.

http
# GET /settings/payment-gateways/all
Response (200 OK)
```json
{
  "success": true,
  "data": {
    "gateways": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "gateway": "STRIPE",
        "display_name": "Stripe Payments",
        "environment": "LIVE",
        "is_enabled": true,
        "min_deposit": 1.00,
        "max_deposit": 5000.00,
        "min_withdrawal": 5.00,
        "max_withdrawal": 10000.00,
        "processing_fee_percent": 2.9,
        "fixed_fee": 0.30,
        "logo_url": "https://cdn.example.com/stripe-logo.png",
        "is_default": true,
        "created_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-15T14:20:00Z"
      },
      {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "gateway": "PAYPAL",
        "display_name": "PayPal Express",
        "environment": "SANDBOX",
        "is_enabled": false,
        "min_deposit": 5.00,
        "max_deposit": 3000.00,
        "min_withdrawal": 10.00,
        "max_withdrawal": 5000.00,
        "processing_fee_percent": 3.4,
        "fixed_fee": 0.35,
        "logo_url": "https://cdn.example.com/paypal-logo.png",
        "is_default": false,
        "created_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-15T14:20:00Z"
      }
    ],
    "enabled_methods": ["credit_debit_card", "paypal"]
  }
}
```
# 3.3 Enable Payment Gateway
Enables a specific payment gateway.

http
# POST /settings/payment-gateways/enable
Request Body
```json
{
  "gateway": "PAYPAL",
  "environment": "LIVE"
}
```
Validation Rules
# Field	Type	Required	Valid Values
# gateway	string	Yes	PAYPAL, STRIPE, REVOLUT
environment	string	Yes	SANDBOX, LIVE
Response (200 OK)
```json
{
  "success": true,
  "message": "Payment gateway PAYPAL enabled successfully"
}
```
# 3.4 Disable Payment Gateway
Disables a specific payment gateway.

http
# POST /settings/payment-gateways/disable
Request Body
```json
{
  "gateway": "PAYPAL",
  "environment": "LIVE"
}```
Response (200 OK)
```json
{
  "success": true,
  "message": "Payment gateway PAYPAL disabled successfully"
}
```
# 3.5 Configure Payment Gateway
# Creates or updates payment gateway configuration.

http
# POST /settings/payment-gateways/configure
Request Body
```json
{
  "gateway": "STRIPE",
  "environment": "LIVE",
  "display_name": "Stripe Live Payments",
  "client_id": "ca_1234567890",
  "client_secret": "sk_live_1234567890",
  "api_key": "sk_live_1234567890",
  "webhook_secret": "whsec_1234567890",
  "public_key": "pk_live_1234567890",
  "private_key": "sk_live_1234567890",
  "min_deposit": 10.00,
  "max_deposit": 5000.00,
  "min_withdrawal": 20.00,
  "max_withdrawal": 3000.00,
  "processing_fee_percent": 2.9,
  "fixed_fee": 0.30,
  "logo_url": "https://cdn.example.com/stripe-live-logo.png",
  "is_default": true,
  "allowed_countries": ["GB", "US", "CA", "AU"],
  "restricted_countries": ["RU", "CN", "IR"]
}
```

Response (200 OK)
```json
{
  "success": true,
  "message": "Payment gateway configured successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "gateway": "STRIPE",
    "display_name": "Stripe Live Payments",
    "environment": "LIVE",
    "is_enabled": true,
    "min_deposit": 10.00,
    "max_deposit": 5000.00,
    "min_withdrawal": 20.00,
    "max_withdrawal": 3000.00,
    "processing_fee_percent": 2.9,
    "fixed_fee": 0.30,
    "logo_url": "https://cdn.example.com/stripe-live-logo.png",
    "is_default": true,
    "allowed_countries": ["GB", "US", "CA", "AU"],
    "restricted_countries": ["RU", "CN", "IR"],
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T15:45:00Z"
  }
}
```
# Gateway Configuration Mapping
# Gateway	Method Key	Display Name	Supported Environments
# STRIPE	credit_debit_card	Credit/Debit Cards	SANDBOX, LIVE
# PAYPAL	paypal	PayPal	SANDBOX, LIVE
# REVOLUT	revolut	Revolut	SANDBOX, LIVE
# Manual	bank_transfer	Bank Transfer	N/A


# 4. Transaction Limits Management
# 4.1 Get Transaction Limits
Retrieves current transaction limits configuration.

http
# GET /settings/transaction-limits
Response (200 OK)
```json
{
  "success": true,
  "data": {
    "min_deposit": 10.00,
    "max_deposit": 10000.00,
    "min_withdrawal": 20.00,
    "max_withdrawal": 5000.00,
    "daily_deposit_limit": 5000.00,
    "daily_withdrawal_limit": 2000.00
  }
}
```
# 4.2 Update Transaction Limits
Updates transaction limits configuration.

http
# POST /settings/transaction-limits
Request Body
```json
{
  "min_deposit": 5.00,
  "max_deposit": 15000.00,
  "min_withdrawal": 10.00,
  "max_withdrawal": 7500.00,
  "daily_deposit_limit": 10000.00,
  "daily_withdrawal_limit": 5000.00
}
```

Response (200 OK)
```json
{
  "success": true,
  "message": "Transaction limits updated successfully",
  "data": {
    "min_deposit": 5.00,
    "max_deposit": 15000.00,
    "min_withdrawal": 10.00,
    "max_withdrawal": 7500.00,
    "daily_deposit_limit": 10000.00,
    "daily_withdrawal_limit": 5000.00
  }
}
```


Error Handling
Common Error Responses
400 Bad Request (Validation Error)
```json
{
  "success": false,
  "message": "New password must be at least 8 characters long"
}
401 Unauthorized
json
{
  "success": false,
  "message": "Authentication required"
}
403 Forbidden
json
{
  "success": false,
  "message": "Insufficient permissions"
}
404 Not Found
json
{
  "success": false,
  "message": "Admin not found"
}
409 Conflict
json
{
  "success": false,
  "message": "Gateway already configured"
}
500 Internal Server Error
json
{
  "success": false,
  "message": "Internal server error",
  "error": "Database connection failed"
}
```
