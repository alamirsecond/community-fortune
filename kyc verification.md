

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
# 28. Get All Verifications
# GET /verifications/dashboard-stats

```json
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
  ```