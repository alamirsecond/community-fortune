## Legal Documents API Documentation (Frontend Integration)
## Overview
## This API manages legal documents (Terms & Conditions, Privacy Policy, etc.) with versioning and activation capabilities.

## Base URL as before 

## /api/legal
##  Authentication
## Public endpoints: No authentication required

## Admin endpoints: Require authentication with appropriate roles (ADMIN, SUPERADMIN, USER)

 ## Document Types
## The system supports these document types:

## TERMS - Terms and Conditions

## PRIVACY - Privacy Policy

## COOKIE - Cookie Policy

## RESPONSIBLE_PLAY - Responsible Play Policy

## WEBSITE_TERMS - Website Terms of Service

## OTHER - Other legal documents

##  API Endpoints
## 1. Get Active Document (Public)
## text
## GET /api/legal/public/:type
## No authentication required

## Parameters:

## type - Document type (e.g., "TERMS", "PRIVACY")

## Response:

``` json
{
  "success": true,
  "data": {
    "id": "uuid-string",
    "title": "Document Title",
    "type": "TERMS",
    "content": "HTML content here",
    "version": "1.0",
    "isActive": true,
    "effectiveDate": "2024-01-01T00:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```
## 2. Get All Documents (Filtered)
## text
## GET /api/legal/all
## Required roles: ADMIN, SUPERADMIN, USER

## Query Parameters:

## type (optional) - Filter by document type

## is_active (optional) - Filter by active status (true/false)

## Response:

``` json
{
  "success": true,
  "data": [
    {
      "id": "uuid-string",
      "title": "Document Title",
      "type": "TERMS",
      "content": "HTML content",
      "version": "1.0",
      "isActive": true,
      "effectiveDate": "2024-01-01T00:00:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "updatedBy": "admin@email.com"
    }
  ],
  "count": 1
}
```
## 3. Get Document by ID
## text
## GET /api/legal/:id
## Required roles: ADMIN, SUPERADMIN, LAWYER

## Response: Same structure as "Get All" single document

## 4. Get Document Types Summary
## text
## GET /api/legal/types
## Required roles: ADMIN, SUPERADMIN, USER

## Response:

``` json
{
  "success": true,
  "data": [
    {
      "type": "TERMS",
      "typeName": "TERMS",
      "activeDocument": {
        "id": "uuid-string",
        "title": "Current Terms",
        "version": "2.0",
        "updatedAt": "2024-01-15T00:00:00.000Z"
      },
      "totalVersions": 5,
      "latestUpdate": "2024-01-15T00:00:00.000Z"
    }
  ]
}
``` 
## 5. Create New Document
## text
## POST /api/legal/create
## Required roles: ADMIN, SUPERADMIN

## Request Body:

``` json
{
  "title": "New Terms of Service",
  "type": "TERMS",
  "content": "<h1>New Terms</h1><p>Content here</p>",
  "version": "2.0", // Optional, defaults to "1.0"
  "isActive": true, // Optional, defaults to true
  "effectiveDate": "2024-02-01T00:00:00.000Z" // Optional
}
```
## Note: If isActive is true, this will automatically deactivate other documents of the same type.

## 6. Update Document
## text
## PUT /api/legal/update/:id
## Required roles: ADMIN, SUPERADMIN

## Request Body: Partial update with any of these fields:

``` json
{
  "title": "Updated Title",
  "type": "PRIVACY", // If changed, handles activation logic
  "content": "Updated content",
  "version": "2.1",
  "isActive": true, // Can activate/deactivate
  "effectiveDate": "2024-02-01T00:00:00.000Z"
}
```
## 7. Activate Specific Document
## text
## PATCH /api/legal/activate/:id
## Required roles: ADMIN, SUPERADMIN

## Description: Activates a specific document and deactivates all others of the same type.

## 8. Delete Document
## text
## DELETE /api/legal/delete/:id
## Required roles: ADMIN, SUPERADPERADMIN