---
title: Super Admin API Documentation
---

# Super Admin API Documentation

## Base URL
`https://community-fortune-api.onrender.com`

## Authentication
All endpoints require a Super Admin authentication token in the header:

```
Authorization: Bearer <your-super-admin-token>
```

## Response Format
All responses follow this format:

```json
{
  "success": true/false,
  "message": "Descriptive message",
  "data": { ... },
  "error": "Error message",
  "details": [ ... ]
}
```

# Dashboard Endpoints

## 1. Get Dashboard Statistics
**GET** `/dashboard/stats`

Get comprehensive dashboard statistics for super admin.

### Response

```json
{
  "success": true,
  "data": {
    "summary": {
      "users": {
        "total": 1250,
        "active": 1100,
        "pending_kyc": 15,
        "total_admins": 8,
        "active_admins": 6
      },
      "competitions": {
        "active": 25,
        "recent": 10
      },
      "admin_activities": {
        "active_admins_30d": 5,
        "total_activities_30d": 245,
        "last_activity": "2024-01-20T15:30:00Z"
      }
    },
    "revenue": {
      "overview": {
        "total": {
          "value": 12500.75,
          "formatted": "£12,500.75"
        },
        "this_month": {
          "value": 2500.50,
          "formatted": "£2,500.50",
          "growth": 15.5
        },
        "today": {
          "value": 350.25,
          "formatted": "£350.25",
          "growth": 5.2
        },
        "yesterday": {
          "value": 332.80,
          "formatted": "£332.80"
        }
      },
      "breakdown": {
        "purchases": {
          "total": 8500.25,
          "formatted": "£8,500.25",
          "count": 125,
          "pending": 3,
          "average": "£68.00"
        },
        "deposits": {
          "total": 5000.50,
          "formatted": "£5,000.50",
          "count": 85,
          "pending": 2,
          "average": "£58.83"
        },
        "subscriptions": {
          "total": 1500.00,
          "formatted": "£1,500.00",
          "active_users": 45,
          "count": 50
        },
        "withdrawals": {
          "requested": 2500.00,
          "formatted": "£2,500.00",
          "paid": 2000.00,
          "pending": 500.00,
          "count": 30
        },
        "referral_payouts": {
          "total": 500.00,
          "formatted": "£500.00",
          "count": 25
        }
      },
      "metrics": {
        "net_revenue": "£10,000.75",
        "average_daily_revenue": "£80.65",
        "conversion_rate": "68.5%"
      },
      "daily_trend": [
        {
          "date": "2024-01-20",
          "purchase_revenue": 350.25,
          "deposit_revenue": 200.50,
          "withdrawal_amount": 50.00
        }
      ]
    },
    "recent_activities": {
      "admin": [
        {
          "id": "uuid",
          "admin_id": "uuid",
          "action": "CREATE_COMPETITION",
          "entity_type": "competition",
          "time_ago": "2 hours ago",
          "admin_email": "admin@example.com",
          "formatted_date": "20/01/2024, 15:30:00"
        }
      ],
      "user": [
        {
          "id": "uuid",
          "user_id": "uuid",
          "action": "PURCHASE_TICKET",
          "module": "competitions",
          "time_ago": "30 minutes ago",
          "user_email": "user@example.com",
          "formatted_date": "20/01/2024, 17:30:00"
        }
      ]
    },
    "analytics": {
      "by_module": [
        {
          "module": "competitions",
          "activity_count": 150
        }
      ],
      "top_active_users": [
        {
          "user_id": "uuid",
          "username": "john_doe",
          "email": "john@example.com",
          "activity_count": 45,
          "last_activity": "2024-01-20T17:30:00Z"
        }
      ]
    }
  }
}
```
## 2. Get System Alerts
## GET /system-alerts

## Get recent system alerts.

## Query Parameters:

## limit (optional): Number of alerts to return (default: 5)

## Response:

``` json
{
  "success": true,
  "data": [
    {
      "id": "alert_123",
      "type": "LOW_BALANCE",
      "title": "Low System Balance",
      "message": "System balance is below minimum threshold",
      "priority": "HIGH",
      "created_at": "2024-01-20T10:30:00Z",
      "dismissed": false,
      "metadata": {
        "current_balance": 500.00,
        "threshold": 1000.00
      }
    }
  ]
}
```
## 3. Dismiss System Alert
## PATCH /system-alerts/:id/dismiss

## Dismiss a specific system alert.

## Path Parameters:

## id (required): Alert ID

## Response:

``` json
{
  "success": true,
  "message": "Alert dismissed"
}
```
## User Management Endpoints
## 4. Get User Statistics
## GET /users/stats

## Get user statistics.

## Response:

``` json
{
  "success": true,
  "data": {
    "total_users": 1250,
    "active_users": 1100,
    "new_users_today": 15,
    "new_users_week": 85,
    "pending_kyc": 12,
    "verified_users": 980,
    "suspended_users": 25
  }
}
```
## 5. Get All Users
## GET /users

## Get paginated list of all users.

## Query Parameters:

## page (optional): Page number (default: 1)

## limit (optional): Items per page (default: 20)

## search (optional): Search by email, name, or username

## status (optional): Filter by status (active, suspended, pending)

## Response:

``` json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "uuid",
        "email": "user@example.com",
        "username": "john_doe",
        "first_name": "John",
        "last_name": "Doe",
        "phone": "+441234567890",
        "role": "USER",
        "is_active": true,
        "kyc_status": "VERIFIED",
        "account_status": "ACTIVE",
        "balance": 150.25,
        "created_at": "2024-01-15T10:30:00Z",
        "last_login": "2024-01-20T15:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1250,
      "pages": 63
    }
  }
}
```
## 6. Get User Details
## GET /users/:user_id

## Get detailed information about a specific user.

## Path Parameters:

## user_id (required): User UUID

## Response:

``` json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "username": "john_doe",
      "first_name": "John",
      "last_name": "Doe",
      "phone": "+441234567890",
      "role": "USER",
      "is_active": true,
      "kyc_status": "VERIFIED",
      "account_status": "ACTIVE",
      "balance": 150.25,
      "tickets_purchased": 45,
      "competitions_entered": 25,
      "wins": 3,
      "referral_code": "JOHN123",
      "referred_users": 8,
      "created_at": "2024-01-15T10:30:00Z",
      "last_login": "2024-01-20T15:30:00Z",
      "last_activity": "2024-01-20T17:30:00Z"
    },
    "recent_activity": [
      {
        "id": "uuid",
        "action": "PURCHASE_TICKET",
        "module": "competitions",
        "target_id": "comp_123",
        "details": {
          "competition_name": "Weekend Draw",
          "tickets": 5,
          "amount": 25.00
        },
        "created_at": "2024-01-20T17:30:00Z"
      }
    ],
    "recent_transactions": [
      {
        "id": "uuid",
        "type": "DEPOSIT",
        "amount": 50.00,
        "status": "COMPLETED",
        "description": "Credit card deposit",
        "created_at": "2024-01-19T14:20:00Z"
      }
    ]
  }
}
```
## 7. Update User Status
## PUT /users/:user_id/status

## Update user account status.

## Path Parameters:

## user_id (required): User UUID

## Request Body:

``` json
{
  "status": "ACTIVE" | "SUSPENDED" | "DEACTIVATED"
}
```
## Response:

``` json
{
  "success": true,
  "message": "User status updated successfully"
}
```
## 8. Impersonate User
## POST /users/:user_id/impersonate

## Generate an impersonation token to login as a user (for support purposes).

## Path Parameters:

## user_id (required): User UUID

## Response:

``` json
{
  "success": true,
  "data": {
    "impersonation_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe"
    },
    "expires_in": 3600
  }
}
```
## 9. Delete User
## DELETE /users/:user_id

## Permanently delete a user account.

## Path Parameters:

## user_id (required): User UUID

## Response:

``` json
{
  "success": true,
  "message": "User deleted successfully"
}
```
## 10. Deactivate User
## PUT /users/:user_id/deactivate

## Soft delete/deactivate a user account.

## Path Parameters:

## user_id (required): User UUID

## Response:

``` json
{
  "success": true,
  "message": "User deactivated successfully"
}
```
## 11. Suspend User
## PUT /users/:user_id/suspend

## Suspend a user account temporarily.

## Path Parameters:

## user_id (required): User UUID

## Request Body:

``` json
{
  "reason": "Violation of terms",
  "duration_days": 7
}
```
## Response:

``` json
{
  "success": true,
  "message": "User suspended successfully"
}
```
## 12. Activate User
## PUT /users/:user_id/activate

## Reactivate a suspended or deactivated user.

## Path Parameters:

## user_id (required): User UUID

## Response:

``` json
{
  "success": true,
  "message": "User activated successfully"
}
```
## Admin Management Endpoints
## 13. Create Admin
## POST /createAdmins

## Create a new admin user.

## Request Body:

``` json
{
  "email": "admin@example.com",
  "first_name": "Jane",
  "last_name": "Smith",
  "username": "jane_admin",
  "phone": "+441234567890", 
  "permissions": { 
    "manage_competitions": true,
    "manage_users": false,
    "view_analytics": true,
    "manage_winners": true,
    "manage_content": false,
    "manage_settings": false
  }
}
```
## Response:

``` json
{
  "success": true,
  "message": "Admin created successfully. Login credentials sent to email.",
  "data": {
    "admin_id": "uuid",
    "email": "admin@example.com",
    "first_name": "Jane",
    "last_name": "Smith",
    "permissions": {
      "manage_competitions": true,
      "manage_users": false,
      "view_analytics": true,
      "manage_winners": true,
      "manage_content": false,
      "manage_settings": false
    }
  }
}
```
## 14. Get All Admins
## GET /AllAdmins

## Get paginated list of all admin users.

## Query Parameters:

## page (optional): Page number (default: 1)

## limit (optional): Items per page (default: 20)

## search (optional): Search by email or name

## status (optional): "active" | "inactive" | "all" (default: "active")

## Response:

``` json
{
  "success": true,
  "data": {
    "admins": [
      {
        "id": "uuid",
        "email": "admin@example.com",
        "username": "jane_admin",
        "first_name": "Jane",
        "last_name": "Smith",
        "phone": "+441234567890",
        "is_active": true,
        "created_at": "2024-01-10T10:30:00Z",
        "last_login": "2024-01-20T15:30:00Z",
        "permissions": {
          "manage_competitions": true,
          "manage_users": false,
          "view_analytics": true,
          "manage_winners": true,
          "manage_content": false,
          "manage_settings": false
        },
        "created_by_id": "superadmin_uuid",
        "created_by_email": "superadmin@example.com",
        "created_by_first_name": "Super",
        "created_by_last_name": "Admin",
        "activity_count": 45
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 8,
      "pages": 1
    }
  }
}
```
## 15. Get Admin Details
## GET /getAdmin/:admin_id

## Get detailed information about a specific admin.

## Path Parameters:

## admin_id (required): Admin UUID

## Response:

``` json
{
  "success": true,
  "data": {
    "admin": {
      "id": "uuid",
      "email": "admin@example.com",
      "username": "jane_admin",
      "first_name": "Jane",
      "last_name": "Smith",
      "phone": "+441234567890",
      "is_active": true,
      "created_at": "2024-01-10T10:30:00Z",
      "last_login": "2024-01-20T15:30:00Z",
      "permissions": {
        "manage_competitions": true,
        "manage_users": false,
        "view_analytics": true,
        "manage_winners": true,
        "manage_content": false,
        "manage_settings": false
      },
      "created_by_id": "superadmin_uuid",
      "created_by_email": "superadmin@example.com",
      "created_by_first_name": "Super",
      "created_by_last_name": "Admin"
    },
    "stats": {
      "total_activities": 45,
      "competitions_created": 15,
      "winners_selected": 8,
      "last_activity": "2024-01-20T15:30:00Z"
    },
    "recent_activities": [
      {
        "action": "CREATE_COMPETITION",
        "entity_type": "competition",
        "details": {
          "competition_name": "Weekend Draw"
        },
        "created_at": "2024-01-20T15:30:00Z"
      }
    ]
  }
}
```
## 16. Update Admin
## PUT /updateAdmin/:admin_id

## Update admin details or permissions.

## Path Parameters:

## admin_id (required): Admin UUID

## Request Body:

``` json
{
  "is_active": false, 
  "permissions": { 
    "manage_users": true,
    "manage_content": true
  }
}
```
## Response:

``` json
{
  "success": true,
  "message": "Admin updated successfully"
}
```
## 17. Reset Admin Password
## POST /admins/:admin_id/reset-password

## Reset admin password and send new credentials via email.

## Path Parameters:

## admin_id (required): Admin UUID

## Response:

``` json
{
  "success": true,
  "message": "Admin password reset successful. New password sent to email.",
  "data": {
    "admin_id": "uuid",
    "email": "admin@example.com"
  }
}
```
## 18. Get Activity Logs
## GET /activity-logs

## Get admin activity logs with filtering.

## Query Parameters:

## page (optional): Page number (default: 1)

## limit (optional): Items per page (default: 50)

## admin_id (optional): Filter by specific admin UUID

## action (optional): Filter by action type

## start_date (optional): Filter logs from date (ISO string)

## end_date (optional): Filter logs to date (ISO string)

## Response:

``` json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "uuid",
        "admin_id": "admin_uuid",
        "action": "CREATE_ADMIN",
        "entity_type": "user",
        "entity_id": "new_admin_uuid",
        "ip_address": "192.168.1.1",
        "user_agent": "Mozilla/5.0...",
        "details": {
          "admin_email": "newadmin@example.com",
          "created_by": "superadmin_uuid",
          "permissions": { ... }
        },
        "created_at": "2024-01-20T15:30:00Z",
        "sup_admin_email": "superadmin@example.com",
        "admin_first_name": "Super",
        "admin_last_name": "Admin"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 245,
      "pages": 5
    }
  }
}
```
## Competition Management Endpoints
## 19. Get All Competitions
## GET /competitions

## Get all competitions.

## Query Parameters:

## status (optional): Filter by status (active, completed, upcoming)

## page (optional): Page number

## limit (optional): Items per page

## Response:

``` json
{
  "success": true,
  "data": {
    "competitions": [
      {
        "id": "uuid",
        "name": "Weekend Draw",
        "description": "Weekend special competition",
        "status": "ACTIVE",
        "entry_fee": 5.00,
        "total_tickets": 1000,
        "sold_tickets": 750,
        "start_date": "2024-01-20T00:00:00Z",
        "end_date": "2024-01-21T23:59:59Z",
        "created_at": "2024-01-15T10:30:00Z",
        "total_prize": 5000.00,
        "winner_id": null,
        "winner_name": null
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 25,
      "pages": 2
    }
  }
}
```
## 20. Create Competition
## POST /competitions

## Create a new competition.

## Request Body:

``` json
{
  "name": "New Competition",
  "description": "Competition description",
  "entry_fee": 10.00,
  "total_tickets": 500,
  "start_date": "2024-01-22T00:00:00Z",
  "end_date": "2024-01-28T23:59:59Z",
  "category": "GENERAL",
  "prize_description": "Cash prize: £5000",
  "terms_conditions": "Standard terms apply"
}
```
## Response:

``` json
{
  "success": true,
  "message": "Competition created successfully",
  "data": {
    "id": "uuid",
    "name": "New Competition",
    "status": "UPCOMING",
    "created_at": "2024-01-20T15:30:00Z"
  }
}
```
## 21. Update Competition
## PUT /competitions/:id

## Update competition details.

## Path Parameters:

## id (required): Competition ID

## Request Body:

``` json
{
  "name": "Updated Competition Name",
  "description": "Updated description",
  "entry_fee": 15.00,
  "end_date": "2024-01-30T23:59:59Z"
}
```
 ## Response:

``` json
{
  "success": true,
  "message": "Competition updated successfully"
}
```
## 22. Delete Competition
## DELETE /competitions/:id

## Delete a competition.

## Path Parameters:

## id (required): Competition ID

## Response:

``` json
{
  "success": true,
  "message": "Competition deleted successfully"
}
```
## 23. Draw Winner
## POST /competitions/:id/draw

## Draw a winner for a completed competition.

## Path Parameters:

## id (required): Competition ID

## Response:

``` json
{
  "success": true,
  "message": "Winner drawn successfully",
  "data": {
    "competition_id": "uuid",
    "winner_id": "user_uuid",
    "winner_name": "John Doe",
    "winner_email": "john@example.com",
    "prize_amount": 5000.00,
    "ticket_number": "TKT-123456"
  }
}
```
## Referral Endpoints (via referralRouter)
## 24. Get Referral Stats
## GET /referral/stats

## Get referral program statistics.

## Response:

``` json
{
  "success": true,
  "data": {
    "total_referrals": 125,
    "active_referrers": 85,
    "total_commission_paid": 1250.50,
    "pending_payouts": 250.75,
    "top_referrers": [
      {
        "user_id": "uuid",
        "name": "John Doe",
        "referral_count": 15,
        "total_earned": 150.00
      }
    ]
  }
}
```
## Error Responses
## Common HTTP Status Codes:
## 200: Success

## 201: Created successfully

## 400: Bad Request (validation errors)

## 401: Unauthorized (invalid/missing token)

## 403: Forbidden (insufficient permissions)

## 404: Resource not found

## 409: Conflict (resource already exists)

## 500: Internal server error

## Error Response Example:
``` json
{
  "success": false,
  "error": "User not found",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```


# Updated Super Admin API Documentation (with KYC/Verification)
# Verification/KYC Management Endpoints
# 24. Get Pending Verifications
# GET /verifications/pending

# Get all pending KYC/verification requests.

# Query Parameters:

# page (optional): Page number (default: 1)

# limit (optional): Items per page (default: 20)

# Response:

``` json
{
  "success": true,
  "data": {
    "verifications": [
      {
        "id": "verification_uuid",
        "user_id": "user_uuid",
        "username": "john_doe",
        "email": "john@example.com",
        "full_name": "John Doe",
        "date_of_birth": "1990-05-15",
        "verification_type": "AGE_VERIFICATION",
        "status": "PENDING",
        "document_front_url": "https://bucket.s3.amazonaws.com/documents/front.jpg",
        "document_back_url": "https://bucket.s3.amazonaws.com/documents/back.jpg",
        "selfie_url": "https://bucket.s3.amazonaws.com/documents/selfie.jpg",
        "address_line1": "123 Main Street",
        "city": "London",
        "country": "United Kingdom",
        "submitted_at": "2024-01-20T10:30:00Z",
        "user_joined": "2024-01-10T15:20:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 12,
      "pages": 1
    }
  }
}
```
# 25. Get User Verification Details
# GET /verifications/:user_id

# Get detailed verification information for a specific user.

# Path Parameters:

# user_id (required): User UUID

# Response:

``` json
{
  "success": true,
  "data": {
    "verification": {
      "id": "verification_uuid",
      "user_id": "user_uuid",
      "username": "john_doe",
      "email": "john@example.com",
      "full_name": "John Doe",
      "profile_photo": "https://bucket.s3.amazonaws.com/profiles/avatar.jpg",
      "date_of_birth": "1990-05-15",
      "age": 33,
      "verification_type": "AGE_VERIFICATION",
      "status": "PENDING",
      "document_type": "PASSPORT",
      "document_number": "AB1234567",
      "document_front_url": "https://bucket.s3.amazonaws.com/documents/front.jpg",
      "document_back_url": "https://bucket.s3.amazonaws.com/documents/back.jpg",
      "selfie_url": "https://bucket.s3.amazonaws.com/documents/selfie.jpg",
      "address": {
        "line1": "123 Main Street",
        "line2": "Apt 4B",
        "city": "London",
        "state": "Greater London",
        "postcode": "SW1A 1AA",
        "country": "United Kingdom"
      },
      "submitted_at": "2024-01-20T10:30:00Z",
      "verified_by": null,
      "verified_at": null,
      "rejection_reason": null,
      "user_joined": "2024-01-10T15:20:00Z"
    },
    "consents": [
      {
        "id": "consent_uuid",
        "document_type": "TERMS",
        "document_title": "Terms and Conditions",
        "document_version": "2.1",
        "consented_at": "2024-01-10T15:20:00Z",
        "ip_address": "192.168.1.100",
        "user_agent": "Mozilla/5.0..."
      }
    ]
  }
}
```
# 26. Update Verification Status
# PUT /verifications/:user_id/status

# Approve or reject a user's verification.

# Path Parameters:

# user_id (required): User UUID

# Request Body:

``` json
{
  "status": "APPROVED" | "REJECTED",
  "rejection_reason": "Document unclear" // Optional, required if status is REJECTED
}
```
# Response:

``` json
{
  "success": true,
  "message": "Verification status updated to APPROVED",
  "data": {
    "user_id": "user_uuid",
    "status": "APPROVED",
    "age_verified": true,
    "verified_at": "2024-01-20T15:30:00Z",
    "verified_by": "admin_uuid"
  }
}
```
# 27. Get All Verifications
# GET /verifications

# Get all verifications with filtering.

# Query Parameters:

# page (optional): Page number (default: 1)

# limit (optional): Items per page (default: 20)

# status (optional): Filter by status (PENDING, APPROVED, REJECTED)

# Response:

``` json
{
  "success": true,
  "data": {
    "verifications": [
      {
        "id": "verification_uuid",
        "user_id": "user_uuid",
        "username": "john_doe",
        "email": "john@example.com",
        "full_name": "John Doe",
        "date_of_birth": "1990-05-15",
        "verification_type": "AGE_VERIFICATION",
        "status": "APPROVED",
        "document_type": "PASSPORT",
        "verified_by_name": "admin_jane",
        "verified_at": "2024-01-20T15:30:00Z",
        "submitted_at": "2024-01-20T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 4521,
      "pages": 227
    }
  }
}
```
# Updated Dashboard Stats (with Verification Data)
# From getDashboardStats endpoint:
# Response includes verification statistics:

``` json
{
  "success": true,
  "data": {
    "summary": {
      "verifications": {
        "pending": 12,
        "approved_today": 8,
        "rejected_today": 2,
        "total_verified": 4521
      },
      "users": {
        "total": 1250,
        "active": 1100,
        "pending_kyc": 15,
        "total_admins": 8,
        "active_admins": 6
      }
     
    }
  }
}
```

## Notes for Frontend Developers:
## Authentication: Always include the Bearer token in the Authorization header

## UUID Format: All IDs are UUID strings (not binary)

## Pagination: Use page/limit query parameters for list endpoints

## Currency: All monetary values are in GBP (£)

## Dates: All dates are in ISO 8601 format (UTC)

## Error Handling: Check success field first, then handle errors

## File Uploads: Competition images or user KYC documents use separate upload endpoints

## Real-time Updates: Consider WebSocket connection for real-time dashboard updates

## Rate Limiting: API is rate-limited (100 requests per minute per user)

## Versioning: API version is included in the base URL (/api/v1/...)





# User Export Endpoints

## 1. Export All Users
Exports all users in the system with basic information.

**Endpoint:**
```
GET /api/users/export/all
```

**Query Parameters:**
| Parameter | Type   | Required | Description                         |
|-----------|--------|----------|-------------------------------------|
| search    | string | No       | Search by username or email         |
| role      | string | No       | Filter by user role                 |
| status    | string | No       | verified or unverified for age verification |

**Response:** CSV file download with columns:
```
id, email, username, first_name, last_name, phone, role, is_active, age_verified, created_at, last_login, cash_balance, credit_balance, total_purchases, total_tickets, tier_name, tier_level, subscription_status, ...
```

---

## 2. Export Active Users
Exports only active (non-suspended) users.

**Endpoint:**
```
GET /api/users/export/active
```
**Query Parameters:** Same as Export All Users

---

## 3. Export Pending Users
Exports users who haven't completed age verification.

**Endpoint:**
```
GET /api/users/export/pending
```
**Query Parameters:**
| Parameter | Type   | Required | Description                 |
|-----------|--------|----------|-----------------------------|
| search    | string | No       | Search by username or email |
| role      | string | No       | Filter by user role         |

---

## 4. Export Suspended Users
Exports users who have been suspended (inactive).

**Endpoint:**
```
GET /api/users/export/suspended
```
**Query Parameters:** Same as Export All Users

---

## 5. Export by Date Range
Exports users created within a specific date range.

**Endpoint:**
```
GET /api/users/export/date-range
```
**Query Parameters:**
| Parameter | Type   | Required | Description                 |
|-----------|--------|----------|-----------------------------|
| startDate | string | Yes      | Start date (YYYY-MM-DD)     |
| endDate   | string | Yes      | End date (YYYY-MM-DD)       |
| search    | string | No       | Search by username or email |
| role      | string | No       | Filter by user role         |
| status    | string | No       | verified or unverified      |

---

## 6. Export Tier 1 Users
Exports users with active Tier 1 subscription.

**Endpoint:**
```
GET /api/users/export/tier-1
```
**Query Parameters:** Same as Export All Users

---

## 7. Export Tier 2 Users
Exports users with active Tier 2 subscription.

**Endpoint:**
```
GET /api/users/export/tier-2
```
**Query Parameters:** Same as Export All Users

---

## 8. Export Tier 3 Users
Exports users with active Tier 3 subscription.

**Endpoint:**
```
GET /api/users/export/tier-3
```
**Query Parameters:** Same as Export All Users

---

## 9. Export Free Users
Exports users without any active subscription.

**Endpoint:**
```
GET /api/users/export/free
```
**Query Parameters:** Same as Export All Users

---

## 10. Export Detailed Users
Exports users with comprehensive details including competition stats, referral info, and transaction history.

**Endpoint:**
```
GET /api/users/export/detailed
```
**Query Parameters:**
| Parameter | Type   | Required | Description                 |
|-----------|--------|----------|-----------------------------|
| limit     | number | No       | Max users to export (default: 100) |
| search    | string | No       | Search by username or email |
| role      | string | No       | Filter by user role         |
| status    | string | No       | verified or unverified      |

**Includes:**
- Profile information
- Wallet balances and breakdown
- Competition statistics
- Transaction history
- Referral information
- Verification status
- Activity logs









# KYC Export Endpoints

## 1. Export All KYC
Exports all KYC verification records in the system.

**Endpoint:**
```
GET /api/export/kyc/all
```

**Query Parameters:**
| Parameter    | Type   | Required | Description                                      |
|--------------|--------|----------|--------------------------------------------------|
| search       | string | No       | Search by username or email                      |
| status       | string | No       | Filter by verification status: PENDING, APPROVED, REJECTED |
| documentType | string | No       | Filter by document type: DRIVERS_LICENSE, PASSPORT, NATIONAL_ID |

**Response:** CSV file download with columns:
```
verification_id, user_id, user_username, user_email, verification_status, verification_type, document_type, document_number, first_name, last_name, date_of_birth, government_id_type, government_id_number, verified_by, verified_at, rejected_reason, created_at, updated_at, document_front_url, document_back_url, selfie_url
```

---

## 2. Export All Pending KYC
Exports only KYC records that are pending review.

**Endpoint:**
```
GET /api/export/kyc/pending
```
**Query Parameters:**
| Parameter    | Type   | Required | Description                 |
|--------------|--------|----------|-----------------------------|
| search       | string | No       | Search by username or email |
| documentType | string | No       | Filter by document type     |

---

## 3. Export All Approved KYC
Exports only KYC records that have been approved.

**Endpoint:**
```
GET /api/export/kyc/approved
```
**Query Parameters:**
| Parameter    | Type   | Required | Description                 |
|--------------|--------|----------|-----------------------------|
| search       | string | No       | Search by username or email |
| documentType | string | No       | Filter by document type     |

---

## 4. Export All Rejected KYC
Exports only KYC records that have been rejected.

**Endpoint:**
```
GET /api/export/kyc/rejected
```
**Query Parameters:**
| Parameter    | Type   | Required | Description                 |
|--------------|--------|----------|-----------------------------|
| search       | string | No       | Search by username or email |
| documentType | string | No       | Filter by document type     |

---

## 5. Export by Document Type: Driver's License
Exports KYC records where the document type is Driver's License.

**Endpoint:**
```
GET /api/export/kyc/drivers-license
```
**Query Parameters:**
| Parameter | Type   | Required | Description                 |
|----------|--------|----------|-----------------------------|
| search   | string | No       | Search by username or email |
| status   | string | No       | Filter by verification status |

---

## 6. Export by Document Type: Passport
Exports KYC records where the document type is Passport.

**Endpoint:**
```
GET /api/export/kyc/passport
```
**Query Parameters:**
| Parameter | Type   | Required | Description                 |
|----------|--------|----------|-----------------------------|
| search   | string | No       | Search by username or email |
| status   | string | No       | Filter by verification status |

---

## 7. Export by Document Type: National ID
Exports KYC records where the document type is National ID.

**Endpoint:**
```
GET /api/export/kyc/national-id
```
**Query Parameters:**
| Parameter | Type   | Required | Description                 |
|----------|--------|----------|-----------------------------|
| search   | string | No       | Search by username or email |
| status   | string | No       | Filter by verification status |

---

## 8. Export Detailed KYC
Exports KYC records with comprehensive details including documents and review history.

**Endpoint:**
```
GET /api/export/kyc/detailed
```
**Query Parameters:**
| Parameter    | Type   | Required | Description                 |
|--------------|--------|----------|-----------------------------|
| limit        | number | No       | Max records to export (default: 100) |
| search       | string | No       | Search by username or email |
| status       | string | No       | Filter by verification status |
| documentType | string | No       | Filter by document type     |

**Includes:**
- All basic KYC information
- Document details: file names, types, status
- Review history with admin notes
- Review counts and last review information

---

## 9. Bulk KYC Export (Flexible)
Flexible endpoint for complex KYC export scenarios.

**Endpoint:**
```
POST /api/export/kyc/bulk
```
**Request Body:**
```json
{
  "type": "all", // Required: "all", "pending", "approved", "rejected", "drivers_license", "passport", "national_id", "detailed"
  "status": "PENDING", // Optional: For status-specific exports
  "documentType": "PASSPORT", // Optional: For document type-specific exports
  "search": "john",
  "limit": 100 // For "detailed" type
}
```

**Response Format:**
- All endpoints return a CSV file with:
  - Content-Type: text/csv
  - Content-Disposition: attachment; filename="{export_type}_{timestamp}.csv"
  - File Naming: `{export_type}_{YYYY-MM-DDTHH-mm-ss}.csv`

**Error Responses:**
- 400 Bad Request:
  ```json
  {
    "success": false,
    "error": "Invalid KYC export type"
  }
  ```
- 404 Not Found:
  ```json
  {
    "success": false,
    "message": "No KYC records found to export"
  }
  ```
- 500 Internal Server Error:
  ```json
  {
    "success": false,
    "error": "Internal server error"
  }
  ```







# Competition Creation API Documentation
#  📋 Overview
 # This API allows administrators to create various types of competitions with support for file uploads, complex validation, and multiple competition categories.

#  🚀 Base Endpoint
#  text
#  POST /api/competitions
#  🔐 Authentication & Authorization
#  Required Roles: SUPERADMIN or ADMIN

# Headers:

#  text
#  Authorization: Bearer {jwt_token}
#  Content-Type: multipart/form-data
#  📁 File Upload Fields
#  Required File Field Names:
#  Field Name	Type	Max Count	Allowed Formats	Max Size
#  featured_image	Image	1	JPG, PNG, GIF, WebP	10MB
# featured_video	Video	1	MP4, AVI, MOV, WebM	50MB
#  banner_image	Image	1	JPG, PNG, GIF, WebP	10MB
#  gallery_images	Image	10	JPG, PNG, GIF, WebP	10MB each
# 📝 Postman File Upload Tips:
#  For single files: One entry per field

#  For multiple gallery images: Create multiple entries with the SAME field name

# text
#  gallery_images: [file1.jpg]
#  gallery_images: [file2.jpg]
#  gallery_images: [file3.jpg]
#  🏆 Competition Categories
#  The system supports 8 competition types:

#  Category	Description	Price Range	Max Tickets
#  FREE	Free-to-enter competitions	£0	10,000
# PAID	Standard paid competitions	Up to £10,000	100,000
# JACKPOT	Million-ticket jackpots	£10-£100	10,000,000
#  MINI_GAME	Skill-based mini-games	Up to £50	50,000
# SUBSCRIPTION	Subscriber-only competitions	£0	5,000
# VIP	VIP-tier exclusive	Up to £500	1,000
# INSTANT_WIN	Instant win tickets	Up to £100	50,000
#  ROLLING	Recurring competitions	Up to £1,000	100,000
# 📝 Request Body (Form-Data)
#  Common Fields (All Competitions)
``` javascript
// Text fields (required for all)
title: "Win a Luxury Car"
description: "Enter for a chance to win..."
category: "PAID"  // One of: PAID, FREE, JACKPOT, MINI_GAME, SUBSCRIPTION, VIP, INSTANT_WIN, ROLLING
price: "25.00"
total_tickets: "10000"
max_entries_per_user: "50"
start_date: "2024-12-01T00:00:00.000Z"
end_date: "2024-12-31T23:59:59.000Z"
no_end_date: "false"  // true/false

// UK Compliance - Choose ONE:
skill_question_enabled: "true"
skill_question: "What year was the company founded?"
skill_question_answer: "1990"
// OR
free_entry_enabled: "true"
free_entry_instructions: "Send your entry to..."

// Type and status
type: "STANDARD"  // STANDARD, MANUAL_DRAW, AUTO_DRAW
competition_type: "PAID"  // PAID or FREE
is_free_competition: "false"

🎰 JACKPOT-Specific Fields
javascript
// Required for JACKPOT category
prize_option: "A"  // A, B, C, CUSTOM
ticket_model: "MODEL_1"  // MODEL_1, MODEL_2, CUSTOM
threshold_type: "AUTOMATIC"  // AUTOMATIC, MANUAL
threshold_value: "1200"
jackpot_amount: "1000000"
min_ticket_price: "10"
points_per_pound: "100"
📱 SUBSCRIPTION-Specific Fields
javascript
// Required for SUBSCRIPTION category
subscription_tier: "TIER_1"  // TIER_1, TIER_2, TIER_3, CUSTOM
subscriber_competition_type: "CHAMPION_SUB_COMPETITION"
auto_entry_enabled: "true"
max_subscribers: "1000"
subscription_required: "true"
🎮 MINI_GAME-Specific Fields
javascript
// Required for MINI_GAME category
game_type: "PAY_TO_PLAY"  // FREE_TO_PLAY, PAY_TO_PLAY, REFER_A_FRIEND
leaderboard_type: "DAILY"  // DAILY, WEEKLY, MONTHLY
game_name: "Brain Teaser Challenge"
game_code: "PUZZLE_001"
points_per_play: "100"
max_plays_per_user: "10"
difficulty_level: "MEDIUM"  // EASY, MEDIUM, HARD
```

#  INSTANT_WIN Arrays (JSON String)
``` javascript
// Array of instant win prizes
instant_wins: '[{
  "prize_name": "£50 Amazon Voucher",
  "prize_amount": 50,
  "payout_type": "SITE_CREDIT",
  "ticket_numbers": [100, 200, 300, 400, 500],
  "max_count": 5,
  "image_url": "https://example.com/voucher.jpg",
  "description": "Digital Amazon gift card",
  "claim_deadline": "2024-12-31T23:59:59.000Z"
}]'
```
# instant_win_enabled: "true"
# max_instant_wins_per_user: "2"
#  ACHIEVEMENTS Arrays (JSON String)
``` javascript
// Array of achievements
achievements: '[{
  "title": "First Purchase Bonus",
  "description": "Buy your first ticket",
  "type": "FIRST_PURCHASE",
  "condition_value": 1,
  "points_awarded": 100,
  "image_url": "https://example.com/badge.png",
  "is_hidden": false,
  "repeatable": false
}]'

achievements_enabled: "true"
⭐ VIP-Specific Fields
javascript
vip_required: "true"
vip_tier: "TIER_2"  // TIER_1, TIER_2, TIER_3
vip_exclusive_content: "Exclusive VIP preview content"
vip_early_access: "true"
🔄 ROLLING-Specific Fields
javascript
rolling_duration_days: "7"
rolling_prize_pool: "5000"
rolling_winners_per_cycle: "3"
next_draw_date: "2024-12-08T12:00:00.000Z"
✅ Sample Requests by Category
1. FREE Competition
javascript
// Form-data:
title: "Free iPhone Giveaway"
category: "FREE"
competition_type: "FREE"
is_free_competition: "true"
price: "0"
total_tickets: "5000"
skill_question_enabled: "true"
skill_question: "What is 2+2?"
skill_question_answer: "4"
featured_image: [file]
2. PAID Competition
javascript
title: "Luxury Apartment Draw"
category: "PAID"
price: "50"
total_tickets: "1000"
free_entry_enabled: "true"
free_entry_instructions: "Send handwritten entry to..."
featured_image: [file]
banner_image: [file]
gallery_images: [file1, file2, file3]
3. JACKPOT Competition
javascript
title: "£1 Million Jackpot"
category: "JACKPOT"
price: "10"
total_tickets: "1000000"
prize_option: "A"
ticket_model: "MODEL_1"
jackpot_amount: "1000000"
threshold_type: "AUTOMATIC"
threshold_value: "1200"
featured_image: [file]
featured_video: [file]
4. MINI_GAME Competition
javascript
title: "Puzzle Tournament"
category: "MINI_GAME"
game_type: "FREE_TO_PLAY"
leaderboard_type: "WEEKLY"
game_name: "Brain Teaser"
price: "0"
total_tickets: "10000"
points_per_play: "100"
difficulty_level: "MEDIUM"
featured_image: [file]
5. SUBSCRIPTION Competition
javascript
title: "Gold Member Exclusive"
category: "SUBSCRIPTION"
subscription_tier: "TIER_1"
subscriber_competition_type: "CHAMPION_SUB_COMPETITION"
price: "0"
total_tickets: "2000"
auto_entry_enabled: "true"
max_subscribers: "500"
featured_image: [file]
```
#  Validation Rules
# UK Compliance Rules:
# Paid competitions (excluding Jackpot) MUST have either:

# skill_question_enabled: true (with question and answer)

# free_entry_enabled: true (with postal instructions)

# Cannot have both skill question AND free entry enabled

#  Category-Specific Rules:
# FREE: Price must be 0, is_free_competition: true

# JACKPOT: Minimum ticket price £10, requires prize option and ticket model

# SUBSCRIPTION: Price must be 0, requires subscription tier

# VIP: Requires vip_required: true and VIP tier

# MINI_GAME: Requires game_type, leaderboard_type, and game_name

# File Validation:
# Images: Only image files (JPG, PNG, GIF, WebP), max 10MB

# Videos: Only video files (MP4, AVI, MOV, WebM), max 50MB

# Gallery: Max 10 images (20 total validation)

# Date Validation:
# end_date must be after start_date

# If no_end_date: false, end_date is required

#  Response Formats
# Success Response (201 Created)
```json
{
  "success": true,
  "message": "Competition created successfully",
  "data": {
    "competitionId": "uuid-string",
    "category": "PAID",
    "files": {
      "featured_image": "https://cdn.example.com/featured.jpg",
      "featured_video": null,
      "banner_image": "https://cdn.example.com/banner.jpg",
      "gallery_images": [
        "https://cdn.example.com/gallery1.jpg",
        "https://cdn.example.com/gallery2.jpg"
      ]
    },
    "next_steps": ["Activate competition", "Set up payment gateway"]
  }
}
```
#  Validation Error (400 Bad Request)
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "path": "body.price",
      "message": "Price must be positive"
    },
    {
      "path": "body.category",
      "message": "Jackpot competitions require prize_option and ticket_model"
    }
  ]
}
```
#   File Validation Error (400 Bad Request)
``` json
{
  "success": false,
  "message": "File validation failed",
  "errors": [
    "image.png: featured_image must be an image file",
    "video.txt: Featured video must be a video file"
  ]
}
❌ Authorization Error (403 Forbidden)
json
{
  "success": false,
  "message": "Only administrators can create competitions"
}
❌ Server Error (500 Internal Server Error)
json
{
  "success": false,
  "message": "Failed to create competition",
  "error": "Database connection failed",
  "code": "ER_CONNECTION_LOST"
}
```
#  Error Codes & Messages
#  Multer Upload Errors:
# LIMIT_FILE_SIZE: "File too large. Maximum size allowed is 50MB"

#  LIMIT_FILE_COUNT: "Too many files uploaded"

# LIMIT_UNEXPECTED_FILE: "Unexpected field name for file upload"

# LIMIT_PART_COUNT: "Too many parts in the form"

# Validation Error Messages:
#  "Paid competitions must have either skill question or free entry enabled for UK compliance"

# "Jackpot competitions minimum ticket price is £10"

# "Subscription competitions require a subscription tier"

# "End date must be after start date"

# "Max entries per user cannot exceed total tickets"

#  Best Practices & Tips
# 1. Testing Strategy:
# Start with minimal data (no files)

# Add files one by one

# Test each competition category separately

# Use Postman Collections for organized testing

# 2. File Handling:
# Compress images before upload (recommended: <2MB)

# Use standard formats (JPG for photos, PNG for graphics)

# Videos should be optimized for web (H.264 codec)

# 3. Date Formatting:
# Always use ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ

# Timezone: UTC recommended

# Example: "2024-12-01T00:00:00.000Z"

# 4. JSON Arrays:
# Stringify arrays before sending: JSON.stringify(array)

# Ensure valid JSON format

# Test array structures separately

# 5. Environment Variables:
# bash
# Required for file uploads
# MAX_COMPETITION_IMAGE_SIZE=10485760    # 10MB
# MAX_COMPETITION_VIDEO_SIZE=52428800    # 50MB
# COMPETITION_UPLOAD_PATH=/uploads/competitions
#  Postman Collection Example
```json
{
  "info": {
    "name": "Competition Creation API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Create FREE Competition",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{admin_token}}"
          }
        ],
        "body": {
          "mode": "formdata",
          "formdata": [
            {"key": "title", "value": "Free Competition"},
            {"key": "category", "value": "FREE"},
            {"key": "price", "value": "0"},
            {"key": "total_tickets", "value": "1000"},
            {"key": "skill_question_enabled", "value": "true"},
            {"key": "skill_question", "value": "Test question?"},
            {"key": "skill_question_answer", "value": "Test answer"}
          ]
        },
        "url": "{{base_url}}/api/admin/competitions"
      }
    }
  ],
  "variable": [
    {
      "key": "base_url",
      "value": "http://localhost:3000"
    },
    {
      "key": "admin_token",
      "value": "your_jwt_token_here"
    }
  ]
}
```






# Roles & Permissions:
# Endpoint Type	Required Role	Description
# Admin Endpoints	ADMIN, SUPERADMIN	Full voucher management
# User Endpoints	USER, ADMIN, SUPERADMIN	Voucher validation & redemption
# Headers for all requests:

# text
# Authorization: Bearer {jwt_token}
# Content-Type: application/json
# 📊 API Endpoints
1. Create Voucher (Admin Only)
text
POST /api/vouchers/admin/create
Request Body:

json
{
  "code": "WELCOME2024",  // Optional: auto-generates if empty
  "campaign_name": "Welcome Bonus 2024",
  "voucher_type": "SINGLE_USE",  // SINGLE_USE, MULTI_USE, BULK_CODES
  "reward_type": "SITE_CREDIT",  // SITE_CREDIT, FREE_ENTRY, DISCOUNT_PERCENT, DISCOUNT_FIXED, POINTS, RAFFLE_TICKETS
  "reward_value": 10,
  "start_date": "2024-12-01",    // YYYY-MM-DD format
  "expiry_date": "2024-12-31",   // YYYY-MM-DD format
  "usage_limit": 1,              // For SINGLE_USE: must be 1
  "code_prefix": "WELCOME",      // Optional prefix for codes
  "bulk_quantity": 0,            // Required for BULK_CODES (>0)
  "bulk_code_length": 8          // 4-32 characters
}
Sample Requests:

Single-use voucher:

json
{
  "code": "SAVE20",
  "campaign_name": "20% Off Sale",
  "voucher_type": "SINGLE_USE",
  "reward_type": "DISCOUNT_PERCENT",
  "reward_value": 20,
  "start_date": "2024-01-01",
  "expiry_date": "2024-06-30",
  "usage_limit": 1
}
Multi-use voucher:

json
{
  "code": "REFERRAL50",
  "campaign_name": "Referral Program",
  "voucher_type": "MULTI_USE",
  "reward_type": "SITE_CREDIT",
  "reward_value": 50,
  "start_date": "2024-01-01",
  "expiry_date": "2024-12-31",
  "usage_limit": 100
}
Bulk codes voucher:

json
{
  "code": "BULKPROMO",
  "campaign_name": "Bulk Promotion",
  "voucher_type": "BULK_CODES",
  "reward_type": "FREE_ENTRY",
  "reward_value": 5,
  "start_date": "2024-03-01",
  "expiry_date": "2024-03-31",
  "usage_limit": 0,
  "code_prefix": "PROMO",
  "bulk_quantity": 100,
  "bulk_code_length": 10
}
Success Response (201):

json
{
  "success": true,
  "message": "Voucher created",
  "data": {
    "id": "f2fd64b7-c2d6-4a4b-a0cf-41c93fc18edb",
    "code": "WELCOME2024",
    "campaign_name": "Welcome Bonus 2024",
    "voucher_type": "SINGLE_USE",
    "reward_type": "SITE_CREDIT",
    "reward_value": 10,
    "start_date": "2024-12-01 00:00:00",
    "expiry_date": "2024-12-31 00:00:00",
    "usage_limit": 1,
    "code_prefix": "WELCOME",
    "bulk_quantity": 0,
    "bulk_codes_generated": false,
    "bulk_code_length": 8,
    "bulk_codes_count": 0
  }
}
2. List Vouchers (Admin Only)
text
GET /api/vouchers/admin/list
Query Parameters:

Parameter	Type	Description
page	integer	Page number (default: 1)
limit	integer	Items per page (default: 20, max: 100)
q	string	Search by code or campaign name
is_active	boolean	Filter by active status
status	string	active, expired, scheduled, inactive
type	string	SINGLE_USE, MULTI_USE, BULK_CODES
sort	string	value_desc, expiry_asc, usage_desc, usage_asc
Sample Request:

text
GET /api/vouchers/admin/list?page=1&limit=20&status=active&sort=expiry_asc
Success Response:

json
{
  "success": true,
  "data": {
    "vouchers": [
      {
        "id": "uuid-string",
        "code": "WELCOME2024",
        "code_prefix": "WELCOME",
        "campaign_name": "Welcome Bonus 2024",
        "voucher_type": "SINGLE_USE",
        "reward_type": "SITE_CREDIT",
        "reward_value": 10,
        "start_date": "2024-12-01 00:00:00",
        "expiry_date": "2024-12-31 00:00:00",
        "usage_limit": 1,
        "times_redeemed": 0,
        "bulk_quantity": 0,
        "bulk_generated": false,
        "bulk_code_length": 8,
        "status": "ACTIVE",
        "created_by_uuid": "admin-uuid",
        "created_at": "2024-01-20 10:30:00",
        "updated_at": "2024-01-20 10:30:00",
        "computed_status": "active",
        "usage_remaining": 1,
        "usage_percent": 0
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8
    },
    "counts": {
      "total": 150,
      "active": 85,
      "expired": 45,
      "inactive": 15,
      "scheduled": 5
    }
  }
}
3. Get Voucher Details (Admin Only)
text
GET /api/vouchers/admin/:id
Success Response:

json
{
  "success": true,
  "data": {
    "id": "uuid-string",
    "code": "WELCOME2024",
    "code_prefix": "WELCOME",
    "campaign_name": "Welcome Bonus 2024",
    "voucher_type": "SINGLE_USE",
    "reward_type": "SITE_CREDIT",
    "reward_value": 10,
    "start_date": "2024-12-01 00:00:00",
    "expiry_date": "2024-12-31 00:00:00",
    "usage_limit": 1,
    "times_redeemed": 0,
    "bulk_quantity": 0,
    "bulk_generated": false,
    "bulk_code_length": 8,
    "status": "ACTIVE",
    "created_by_uuid": "admin-uuid",
    "created_at": "2024-01-20 10:30:00",
    "updated_at": "2024-01-20 10:30:00",
    "computed_status": "active",
    "usage_remaining": 1,
    "usage_percent": 0
  }
}
4. Update Voucher (Admin Only)
text
PUT /api/vouchers/admin/:id
Request Body (partial updates allowed):

json
{
  "campaign_name": "Updated Campaign Name",
  "reward_value": 15,
  "expiry_date": "2024-12-31",
  "usage_limit": 2,
  "status": "ACTIVE"
}
Success Response:

json
{
  "success": true,
  "message": "Voucher updated"
}
5. Toggle Voucher Status (Admin Only)
text
PATCH /api/vouchers/admin/:id/toggle
Request Body:

json
{
  "is_active": false
}
Success Response:

json
{
  "success": true,
  "message": "Voucher status updated"
}
6. Delete Voucher (Admin Only)
text
DELETE /api/vouchers/admin/:id
Success Response:

json
{
  "success": true,
  "message": "Voucher deleted"
}
7. Get Dashboard Overview (Admin Only)
text
GET /api/vouchers/admin/overview
Success Response:

json
{
  "success": true,
  "data": {
    "total_vouchers": 150,
    "expired": 45,
    "active": 85,
    "active_value": 12500.50,
    "redeemed_today": 15,
    "redeemed_change_pct": 25.5,
    "total_credit_distributed": 50000.75,
    "redemption_rate_30d": 65.25
  }
}
8. Export Vouchers as CSV (Admin Only)
text
GET /api/vouchers/admin/export
Query Parameters: Same as list endpoint
Response: CSV file download with headers

👤 User Endpoints
9. Validate Voucher (User & Admin)
text
POST /api/vouchers/validate
Request Body:

json
{
  "code": "WELCOME2024"
}
Success Response:

json
{
  "success": true,
  "data": {
    "ok": true,
    "alreadyRedeemed": false,
    "voucher": {
      "id": "uuid-string",
      "code": "WELCOME2024",
      "campaign_name": "Welcome Bonus 2024",
      "voucher_type": "SINGLE_USE",
      "reward_type": "SITE_CREDIT",
      "reward_value": 10,
      "start_date": "2024-12-01 00:00:00",
      "expiry_date": "2024-12-31 00:00:00",
      "usage_limit": 1,
      "times_redeemed": 0,
      "status": "active",
      "code_status": null
    }
  }
}
Error Responses:

404: Voucher not found

400: Voucher expired, inactive, or usage limit reached

409: Already redeemed by user

10. Redeem Voucher (User & Admin)
text
POST /api/vouchers/redeem
Request Body:

json
{
  "code": "WELCOME2024"
}
Success Response:

json
{
  "success": true,
  "message": "Voucher redeemed",
  "data": {
    "redemptionId": "uuid-string",
    "voucher": {
      "id": "uuid-string",
      "code": "WELCOME2024",
      "campaign_name": "Welcome Bonus 2024",
      "reward_type": "SITE_CREDIT",
      "reward_value": 10
    },
    "wallet": {
      "new_balance": 110.50,
      "transaction_id": "txn-uuid"
    }
  }
}
Error Responses:

401: Authentication required

404: Voucher not found

400: Invalid voucher status or expired

409: Already redeemed by user

400: Unsupported reward type

📝 Validation Rules
Schema Validation:
javascript
// Date format: YYYY-MM-DD (e.g., "2024-12-01")
// Code: 4-32 alphanumeric characters (auto-generated if empty)
// Code prefix: optional, max 32 characters
// Reward value: positive number, max 1,000,000
// Bulk quantity: required for BULK_CODES (>0)
Business Rules:
Single-use vouchers: usage_limit must be 1

Bulk vouchers: usage_limit auto-sets to bulk_quantity

Code generation: Auto-generates unique 8-char code if not provided

Date validation: expiry_date must be after start_date

Status transitions: Automatic based on dates and usage