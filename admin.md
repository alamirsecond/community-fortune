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
# 19 Endpoint: GET /superAdmin/getAdminStats
# Description
# Retrieves comprehensive dashboard statistics for the admin management system, providing key metrics about administrators including total count, monthly growth, active users, and pending invitations.

# Request
# Headers
# Header	Value	Required
# Authorization	Bearer <access_token>	Yes
# Content-Type	application/json	Yes
# Authentication
# Requires valid JWT token with admin or superadmin privileges

# Method
# text
# GET
# URL
# text
# GET /superAdmin/getAdminStats
# Response
# Success Response (200 OK)
```json
{
  "success": true,
  "data": {
    "total": 8,
    "thisMonth": 1,
    "active": 6,
    "pending": 1,
    "onlineRate": 62.5,
    "stats": {
      "totalAdmins": {
        "value": 8,
        "change": "+1 this month",
        "trend": "up"
      },
      "activeAdmins": {
        "value": 6,
        "percentage": 62.5,
        "change": "62.5% online rate"
      },
      "pendingInvitations": {
        "value": 1,
        "change": "1 pending"
      }
    }
  }
}
```
