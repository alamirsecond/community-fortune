## Contact API Documentation
## Overview
# This document provides comprehensive details about the Contact API backend implementation for the Community Fortune platform. The API handles contact form submissions, message management, and contact information.

## Base URL
 ## text
## http://localhost:3000/api/contact
## Database Schema
## contact_messages Table##
## sql
``` 
CREATE TABLE contact_messages (
  id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') DEFAULT 'NEW',
  priority ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') DEFAULT 'MEDIUM',
  category ENUM('GENERAL', 'SUPPORT', 'TECHNICAL', 'BILLING', 'FEEDBACK', 'COMPLAINT', 'OTHER') DEFAULT 'GENERAL',
  admin_notes TEXT,
  assigned_to VARCHAR(100),
  response_sent BOOLEAN DEFAULT FALSE,
  response_message TEXT,
  response_sent_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_contact_status (status),
  INDEX idx_contact_email (email),
  INDEX idx_contact_created (created_at)
); 
```
contact_settings Table
sql
CREATE TABLE contact_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  setting_key VARCHAR(50) UNIQUE NOT NULL,
  setting_value TEXT,
  description VARCHAR(200),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
📁 API Endpoints
Public Endpoints (No Authentication Required)
1. Submit Contact Message
URL: POST /submit

Description: Submit a new contact message (only 3 fields as shown in design)

Request Body:

json
{
  "full_name": "John Doe",
  "email": "john@example.com",
  "message": "Hello, I have a question about competitions..."
}
Validation Rules:

full_name: 2-100 characters, letters/spaces/hyphens/apostrophes only

email: Valid email format, max 100 characters

message: 10-5000 characters

Success Response (201):

json
{
  "success": true,
  "message": "Thank you for your message. We'll get back to you soon.",
  "data": {
    "messageId": 1,
    "submittedAt": "2024-01-20T10:30:00Z",
    "category": "GENERAL"
  }
}
Error Response (400):

json
{
  "success": false,
  "errors": [
    {
      "field": "email",
      "message": "Invalid email address"
    }
  ]
}
2. Get Contact Settings
URL: GET /settings

Description: Get company contact information

Success Response (200):

json
{
  "success": true,
  "data": {
    "company_name": "Community Fortune Limited",
    "contact_email": "contact@community-fortune.com",
    "website_url": "www.community-fortune.com",
    "address_line1": "194 Harrington Road",
    "address_line2": "Workington, Cumbria",
    "address_line3": "United Kingdom, CA14 3UJ",
    "support_email": "support@community-fortune.com",
    "business_hours": "Mon-Fri: 9:00 AM - 6:00 PM GMT",
    "phone_number": "+44 1234 567890",
    "response_time": "24-48 hours"
  }
}
Admin Endpoints (Authentication Required)
Required Roles: ADMIN, SUPERADMIN, or SUPPORT

1. Get All Messages
URL: GET /messages

Query Parameters:

status: NEW, IN_PROGRESS, RESOLVED, CLOSED

category: GENERAL, SUPPORT, TECHNICAL, BILLING, FEEDBACK, COMPLAINT, OTHER

priority: LOW, MEDIUM, HIGH, URGENT

start_date: YYYY-MM-DD

end_date: YYYY-MM-DD

search: Search in name, email, or message

page: Page number (default: 1)

limit: Items per page (default: 20, max: 100)

Success Response (200):

json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "full_name": "John Doe",
      "email": "john@example.com",
      "message": "Full message content...",
      "message_preview": "First 100 characters of message...",
      "status": "NEW",
      "priority": "MEDIUM",
      "category": "GENERAL",
      "admin_notes": null,
      "assigned_to": null,
      "response_sent": false,
      "response_message": null,
      "response_sent_at": null,
      "created_at": "2024-01-20T10:30:00Z",
      "updated_at": "2024-01-20T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  },
  "statistics": {
    "byStatus": [
      { "status": "NEW", "count": 50 },
      { "status": "IN_PROGRESS", "count": 25 }
    ],
    "totalMessages": 150
  }
}
2. Get Single Message
URL: GET /messages/:id

Description: Get details of a specific message

Success Response (200):

json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "full_name": "John Doe",
    "email": "john@example.com",
    "message": "Full message content here...",
    "status": "NEW",
    "priority": "MEDIUM",
    "category": "GENERAL",
    "admin_notes": null,
    "assigned_to": null,
    "response_sent": false,
    "response_message": null,
    "response_sent_at": null,
    "created_at": "2024-01-20T10:30:00Z",
    "updated_at": "2024-01-20T10:30:00Z"
  }
}
3. Update Message
URL: PUT /messages/:id

Description: Update message status, priority, or admin notes

Request Body:

json
{
  "status": "IN_PROGRESS",
  "priority": "HIGH",
  "admin_notes": "Customer needs urgent assistance"
}
Success Response (200):

json
{
  "success": true,
  "message": "Message updated successfully"
}
4. Send Response to Message
URL: POST /messages/:id/respond

Description: Send a response to the user (also sends email)

Request Body:

json
{
  "response_message": "Dear John, thank you for contacting us...",
  "status": "RESOLVED"
}
Success Response (200):

json
{
  "success": true,
  "message": "Response sent successfully"
}
5. Get Message Statistics
URL: GET /messages/stats

Query Parameters:

start_date: YYYY-MM-DD (optional)

end_date: YYYY-MM-DD (optional)

Success Response (200):

json
{
  "success": true,
  "data": {
    "byCategory": [
      { "category": "GENERAL", "count": 50 },
      { "category": "SUPPORT", "count": 30 }
    ],
    "byStatus": [
      { "status": "NEW", "count": 25 },
      { "status": "RESOLVED", "count": 55 }
    ],
    "dailyTrend": [
      { "date": "2024-01-20", "message_count": 10 },
      { "date": "2024-01-19", "message_count": 8 }
    ],
    "responseMetrics": {
      "responded": 80,
      "pending_response": 20,
      "avg_response_hours": 12.5
    },
    "totalMessages": 100
  }
}
6. Delete Message
URL: DELETE /messages/:id

Description: Delete a contact message (Admin only)

Success Response (200):

json
{
  "success": true,
  "message": "Message deleted successfully"
}
7. Update Contact Settings
URL: PUT /settings

Description: Update company contact information

Request Body:

json
{
  "setting_key": "contact_email",
  "setting_value": "support@community-fortune.com"
}
Success Response (200):

json
{
  "success": true,
  "message": "Contact settings updated successfully",
  "data": {
    "setting_key": "contact_email",
    "setting_value": "support@community-fortune.com",
    "updated_by": "admin@example.com",
    "updated_at": "2024-01-20T10:30:00Z"
  }
}
🔐 Authentication & Authorization
Required Headers for Admin Endpoints:
http
Authorization: Bearer <jwt_token>
Content-Type: application/json
User Roles:
PUBLIC: No authentication required for submitting messages

SUPPORT: Can view, update, and respond to messages

ADMIN: Full access to all endpoints

SUPERADMIN: Full access to all endpoints

🎯 Automatic Category Detection
Messages are automatically categorized based on content:

Keywords in Message	Category
support, help	SUPPORT
bug, error, technical, issue	TECHNICAL
payment, billing, refund, money	BILLING
feedback, suggestion, idea	FEEDBACK
complaint, problem, angry, unhappy	COMPLAINT
(none of above)	GENERAL
📧 Email Integration (To be implemented)
Confirmation Email (Sent to user):
html
Subject: We've Received Your Message - Community Fortune

Hi {full_name},

We've received your message and our team will review it shortly.
We aim to respond within 24-48 hours during business days.

Best regards,
The Community Fortune Team
Response Email (Sent when admin responds):
html
Subject: Response to Your Inquiry - Community Fortune

Hi {full_name},

Thank you for contacting Community Fortune. Here is our response:

{response_message}

If you have any further questions, please don't hesitate to reply to this email.

Best regards,
The Community Fortune Support Team
🛠️ Error Handling
Common Error Responses:
400 Bad Request (Validation Error)
json
{
  "success": false,
  "errors": [
    {
      "field": "email",
      "message": "Invalid email address"
    }
  ]
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
  "message": "Contact message not found"
}
500 Internal Server Error
json
{
  "success": false,
  "message": "Failed to submit message. Please try again later."
}
