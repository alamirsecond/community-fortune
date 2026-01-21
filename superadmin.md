## Super Admin API Documentation
## Base URL:https://community-fortune-api.onrender.com
## Authentication: All endpoints require Super Admin authentication token in the header:

## Authorization: Bearer <your-super-admin-token>
## Response Format
## All responses follow this format:
``` json
{
  "success": true/false,
  "message": "Descriptive message", 
  "data": { ... }, 
  "error": "Error message",
  "details": [ ... ] 
}
```
## Dashboard Endpoints
## 1. Get Dashboard Statistics
## GET /dashboard/stats

## Get comprehensive dashboard statistics for super admin.

## Response:

``` json
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


Updated Super Admin API Documentation (with KYC/Verification)
Verification/KYC Management Endpoints
24. Get Pending Verifications
GET /verifications/pending

Get all pending KYC/verification requests.

Query Parameters:

page (optional): Page number (default: 1)

limit (optional): Items per page (default: 20)

Response:

json
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
25. Get User Verification Details
GET /verifications/:user_id

Get detailed verification information for a specific user.

Path Parameters:

user_id (required): User UUID

Response:

json
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
26. Update Verification Status
PUT /verifications/:user_id/status

Approve or reject a user's verification.

Path Parameters:

user_id (required): User UUID

Request Body:

json
{
  "status": "APPROVED" | "REJECTED",
  "rejection_reason": "Document unclear" // Optional, required if status is REJECTED
}
Response:

json
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
27. Get All Verifications
GET /verifications

Get all verifications with filtering.

Query Parameters:

page (optional): Page number (default: 1)

limit (optional): Items per page (default: 20)

status (optional): Filter by status (PENDING, APPROVED, REJECTED)

Response:

json
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
Updated Dashboard Stats (with Verification Data)
From getDashboardStats endpoint:
Response includes verification statistics:

json
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
      // ... other stats
    }
  }
}

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













use `community_fortune`;

-- ===========================================
-- USER ADDRESSES TABLE - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE IF NOT EXISTS user_addresses (
    id BINARY(16) PRIMARY KEY,
    user_id BINARY(16) NOT NULL,
    address_type ENUM('HOME', 'WORK', 'BILLING', 'SHIPPING') DEFAULT 'HOME',
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100),
    country CHAR(2) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_addresses_user (user_id),
    INDEX idx_user_addresses_primary (user_id, is_primary),
    INDEX idx_user_addresses_country (country)
);

-- ===========================================
-- FIXED: ADMIN ACTIVITY LOGS TABLE
-- ===========================================
CREATE TABLE IF NOT EXISTS admin_activity_logs (
    id BINARY(16) PRIMARY KEY,
    admin_id BINARY(16) NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id BINARY(16),
    ip_address VARCHAR(50),
    user_agent TEXT,
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_admin_activity_logs_admin (admin_id),
    INDEX idx_admin_activity_logs_action (action),
    INDEX idx_admin_activity_logs_entity (entity_type, entity_id),
    INDEX idx_admin_activity_logs_created (created_at)
);

-- ===========================================
-- UPDATE: LEGAL DOCUMENTS TABLE (FIXED VERSION)
-- ===========================================
CREATE TABLE IF NOT EXISTS legal_documents (
    id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
    title VARCHAR(200) NOT NULL,
    type ENUM('TERMS', 'PRIVACY', 'COOKIE', 'RESPONSIBLE_PLAY', 'WEBSITE_TERMS', 'OTHER') NOT NULL,
    content LONGTEXT NOT NULL,
    version VARCHAR(20) DEFAULT '1.0',
    is_active BOOLEAN DEFAULT TRUE,
    effective_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    INDEX idx_legal_documents_type (type),
    INDEX idx_legal_documents_active (type, is_active)
);

-- ===========================================
-- UPDATE: VERIFICATIONS TABLE (ENHANCED)
-- ===========================================
ALTER TABLE verifications 
MODIFY COLUMN status ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'UNDER_REVIEW') DEFAULT 'PENDING',
MODIFY COLUMN verification_type ENUM('KYC', 'AGE', 'ADDRESS', 'ID_VERIFICATION') DEFAULT 'KYC',
MODIFY COLUMN document_type ENUM('PASSPORT', 'DRIVING_LICENSE', 'ID_CARD', 'UTILITY_BILL', 'BANK_STATEMENT', 'OTHER') DEFAULT 'PASSPORT';

-- Add missing columns to verifications table
ALTER TABLE verifications 
ADD COLUMN  first_name VARCHAR(100),
ADD COLUMN  last_name VARCHAR(100),
ADD COLUMN  date_of_birth DATE,
ADD COLUMN  nationality VARCHAR(100),
ADD COLUMN  expiry_date DATE,
ADD COLUMN  issue_date DATE,
ADD COLUMN  issuing_country VARCHAR(100),
ADD COLUMN  address_proof_type VARCHAR(50),
ADD COLUMN  address_proof_url VARCHAR(500),
ADD COLUMN  verification_score INT DEFAULT 0,
ADD COLUMN  risk_level ENUM('LOW', 'MEDIUM', 'HIGH') DEFAULT 'LOW',
ADD COLUMN  metadata JSON;

-- ===========================================
-- UPDATE: USER NOTES TABLE
-- ===========================================
ALTER TABLE user_notes
ADD COLUMN  category ENUM('GENERAL', 'KYC_REVIEW', 'ACCOUNT_ISSUE', 'PAYMENT', 'COMPLAINT', 'PRAISE') DEFAULT 'GENERAL',
ADD COLUMN  priority ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'MEDIUM',
ADD COLUMN  is_resolved BOOLEAN DEFAULT FALSE,
ADD COLUMN  resolved_at DATETIME,
ADD COLUMN  resolved_by BINARY(16);

-- ===========================================
-- CREATE: KYC VERIFICATION SUMMARY VIEW
-- ===========================================
CREATE OR REPLACE VIEW kyc_verification_summary AS
SELECT 
    COUNT(*) as total_verifications,
    SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_count,
    SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved_count,
    SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected_count,
    SUM(CASE WHEN status = 'UNDER_REVIEW' THEN 1 ELSE 0 END) as under_review_count,
    SUM(CASE WHEN DATE(created_at) = CURDATE() AND status = 'APPROVED' THEN 1 ELSE 0 END) as approved_today,
    SUM(CASE WHEN DATE(created_at) = CURDATE() AND status = 'REJECTED' THEN 1 ELSE 0 END) as rejected_today,
    COUNT(DISTINCT user_id) as unique_users
FROM verifications;






Available Export Types
1. Export All Users
Exports all users in the system with basic information.

Endpoint: GET /api/users/export/all

Query Parameters:

Parameter	Type	Required	Description
search	string	No	Search by username or email
role	string	No	Filter by user role
status	string	No	verified or unverified for age verification
Response: CSV file download with columns:

id, email, username, first_name, last_name, phone, role

is_active, age_verified, created_at, last_login

cash_balance, credit_balance, total_purchases, total_tickets

Subscription details: tier_name, tier_level, subscription_status, etc.

2. Export Active Users
Exports only active (non-suspended) users.

Endpoint: GET /api/users/export/active

Query Parameters: Same as Export All Users

3. Export Pending Users
Exports users who haven't completed age verification.

Endpoint: GET /api/users/export/pending

Query Parameters:

Parameter	Type	Required	Description
search	string	No	Search by username or email
role	string	No	Filter by user role
4. Export Suspended Users
Exports users who have been suspended (inactive).

Endpoint: GET /api/users/export/suspended

Query Parameters: Same as Export All Users

5. Export by Date Range
Exports users created within a specific date range.

Endpoint: GET /api/users/export/date-range

Query Parameters:

Parameter	Type	Required	Description
startDate	string	Yes	Start date (YYYY-MM-DD)
endDate	string	Yes	End date (YYYY-MM-DD)
search	string	No	Search by username or email
role	string	No	Filter by user role
status	string	No	verified or unverified
6. Export Tier 1 Users
Exports users with active Tier 1 subscription.

Endpoint: GET /api/users/export/tier-1

Query Parameters: Same as Export All Users

7. Export Tier 2 Users
Exports users with active Tier 2 subscription.

Endpoint: GET /api/users/export/tier-2

Query Parameters: Same as Export All Users

8. Export Tier 3 Users
Exports users with active Tier 3 subscription.

Endpoint: GET /api/users/export/tier-3

Query Parameters: Same as Export All Users

9. Export Free Users
Exports users without any active subscription.

Endpoint: GET /api/users/export/free

Query Parameters: Same as Export All Users

10. Export Detailed Users
Exports users with comprehensive details including competition stats, referral info, and transaction history.

Endpoint: GET /api/users/export/detailed

Query Parameters:

Parameter	Type	Required	Description
limit	number	No	Max users to export (default: 100)
search	string	No	Search by username or email
role	string	No	Filter by user role
status	string	No	verified or unverified
Includes: All data from getUserDetails function:

Profile information

Wallet balances and breakdown

Competition statistics

Transaction history

Referral information

Verification status

Activity logs








Available KYC Export Types
1. Export All KYC
Exports all KYC verification records in the system.

Endpoint: GET /api/export/kyc/all

Query Parameters:

Parameter	Type	Required	Description
search	string	No	Search by username or email
status	string	No	Filter by verification status: PENDING, APPROVED, REJECTED
documentType	string	No	Filter by document type: DRIVERS_LICENSE, PASSPORT, NATIONAL_ID
Response: CSV file download with columns:

verification_id, user_id, user_username, user_email

verification_status, verification_type, document_type, document_number

first_name, last_name, date_of_birth, government_id_type, government_id_number

verified_by, verified_at, rejected_reason, created_at, updated_at

Document URLs: document_front_url, document_back_url, selfie_url

2. Export All Pending KYC
Exports only KYC records that are pending review.

Endpoint: GET /api/export/kyc/pending

Query Parameters:

Parameter	Type	Required	Description
search	string	No	Search by username or email
documentType	string	No	Filter by document type
3. Export All Approved KYC
Exports only KYC records that have been approved.

Endpoint: GET /api/export/kyc/approved

Query Parameters:

Parameter	Type	Required	Description
search	string	No	Search by username or email
documentType	string	No	Filter by document type
4. Export All Rejected KYC
Exports only KYC records that have been rejected.

Endpoint: GET /api/export/kyc/rejected

Query Parameters:

Parameter	Type	Required	Description
search	string	No	Search by username or email
documentType	string	No	Filter by document type
5. Export by Document Type: Driver's License
Exports KYC records where the document type is Driver's License.

Endpoint: GET /api/export/kyc/drivers-license

Query Parameters:

Parameter	Type	Required	Description
search	string	No	Search by username or email
status	string	No	Filter by verification status
6. Export by Document Type: Passport
Exports KYC records where the document type is Passport.

Endpoint: GET /api/export/kyc/passport

Query Parameters:

Parameter	Type	Required	Description
search	string	No	Search by username or email
status	string	No	Filter by verification status
7. Export by Document Type: National ID
Exports KYC records where the document type is National ID.

Endpoint: GET /api/export/kyc/national-id

Query Parameters:

Parameter	Type	Required	Description
search	string	No	Search by username or email
status	string	No	Filter by verification status
8. Export Detailed KYC
Exports KYC records with comprehensive details including documents and review history.

Endpoint: GET /api/export/kyc/detailed

Query Parameters:

Parameter	Type	Required	Description
limit	number	No	Max records to export (default: 100)
search	string	No	Search by username or email
status	string	No	Filter by verification status
documentType	string	No	Filter by document type
Includes:

All basic KYC information

Document details: file names, types, status

Review history with admin notes

Review counts and last review information

9. Bulk KYC Export (Flexible)
Flexible endpoint for complex KYC export scenarios.

Endpoint: POST /api/export/kyc/bulk

Request Body:
json
{
  "type": "all", // Required: "all", "pending", "approved", "rejected", "drivers_license", "passport", "national_id", "detailed"
  "status": "PENDING", // Optional: For status-specific exports
  "documentType": "PASSPORT", // Optional: For document type-specific exports
  "search": "john",
  "limit": 100 // For "detailed" type
}
Response Format
All endpoints return a CSV file with:
Content-Type: text/csv

Content-Disposition: attachment; filename="{export_type}_{timestamp}.csv"

File Naming: {export_type}_{YYYY-MM-DDTHH-mm-ss}.csv

Error Responses
400 Bad Request:

json
{
  "success": false,
  "error": "Invalid KYC export type"
}
404 Not Found:

json
{
  "success": false,
  "message": "No KYC records found to export"
}
500 Internal Server Error:

json
{
  "success": false,
  "error": "Internal server error"
}