Settings API Documentation
Base URL
text
Authentication
All endpoints require SUPERADMIN or ADMIN role with Bearer token.

API Endpoints
1. Password Settings
Change Admin Password

text
POST /password/change
Request Body:

json
{
  "oldPassword": "currentPassword123",
  "newPassword": "NewSecurePassword123!",
  "confirmNewPassword": "NewSecurePassword123!"
}
Response:

json
{
  "success": true,
  "message": "Password changed successfully"
}
2. Maintenance Mode
Get Maintenance Settings

text
GET /maintenance
Response:

json
{
  "success": true,
  "data": {
    "maintenance_mode": false,
    "allowed_ips": ["192.168.1.1"],
    "maintenance_message": "System under maintenance",
    "estimated_duration": "2 hours"
  }
}
Update Maintenance Settings

text
POST /maintenance
Request Body:

json
{
  "maintenance_mode": true,
  "allowed_ips": ["192.168.1.1", "10.0.0.1"],
  "maintenance_message": "System maintenance in progress",
  "estimated_duration": "3 hours"
}
Response:

json
{
  "success": true,
  "message": "Maintenance settings updated successfully",
  "data": {
    "maintenance_mode": true,
    "allowed_ips": ["192.168.1.1", "10.0.0.1"],
    "maintenance_message": "System maintenance in progress",
    "estimated_duration": "3 hours"
  }
}
3. Payment Gateway Configuration
Get Payment Gateways

text
GET /payment-gateways
Response:

json
{
  "success": true,
  "data": {
    "enabled_methods": ["credit_debit_card", "paypal", "bank_transfer", "revolut"],
    "gateways": {
      "stripe": {
        "enabled": true,
        "publishable_key": "pk_test_...",
        "secret_key": "sk_test_..."
      },
      "paypal": {
        "enabled": true,
        "client_id": "AY...",
        "secret": "EL..."
      },
      "revolut": {
        "enabled": false,
        "api_key": ""
      }
    }
  }
}
Update Payment Gateways

text
POST /payment-gateways
Request Body:

json
{
  "enabled_methods": ["credit_debit_card", "paypal"],
  "stripe": {
    "enabled": true,
    "publishable_key": "pk_live_...",
    "secret_key": "sk_live_..."
  },
  "paypal": {
    "enabled": true,
    "client_id": "AZ...",
    "secret": "EF..."
  }
}
Response:

json
{
  "success": true,
  "message": "Payment gateways updated successfully",
  "data": {
    "enabled_methods": ["credit_debit_card", "paypal"],
    "gateways": {
      "stripe": {
        "enabled": true,
        "publishable_key": "pk_live_...",
        "secret_key": "sk_live_..."
      },
      "paypal": {
        "enabled": true,
        "client_id": "AZ...",
        "secret": "EF..."
      }
    }
  }
}
Get Transaction Limits

text
GET /transaction-limits
Response:

json
{
  "success": true,
  "data": {
    "min_deposit": 10.00,
    "max_deposit": 10000.00,
    "min_withdrawal": 20.00,
    "max_withdrawal": 5000.00,
    "daily_deposit_limit": 5000.00,
    "daily_withdrawal_limit": 2000.00,
    "single_purchase_limit": 1000.00
  }
}
Update Transaction Limits

text
POST /transaction-limits
Request Body:

json
{
  "min_deposit": 15.00,
  "max_deposit": 15000.00,
  "min_withdrawal": 25.00,
  "max_withdrawal": 7500.00,
  "daily_deposit_limit": 7500.00,
  "daily_withdrawal_limit": 3000.00,
  "single_purchase_limit": 1500.00
}
Response:

json
{
  "success": true,
  "message": "Transaction limits updated successfully",
  "data": {
    "min_deposit": 15.00,
    "max_deposit": 15000.00,
    "min_withdrawal": 25.00,
    "max_withdrawal": 7500.00,
    "daily_deposit_limit": 7500.00,
    "daily_withdrawal_limit": 3000.00,
    "single_purchase_limit": 1500.00
  }
}
4. Security & Authentication
Get Security Settings

text
GET /security
Response:

json
{
  "success": true,
  "data": {
    "admin_session_timeout": 30,
    "enable_captcha_failed_attempts": true,
    "failed_attempts_threshold": 5,
    "lock_account_minutes": 30,
    "two_factor_enabled": false,
    "password_min_length": 8,
    "password_require_special": true,
    "max_login_attempts": 10
  }
}
Update Security Settings

text
POST /security
Request Body:

json
{
  "admin_session_timeout": 45,
  "enable_captcha_failed_attempts": true,
  "failed_attempts_threshold": 3,
  "lock_account_minutes": 60,
  "two_factor_enabled": true,
  "password_min_length": 12,
  "password_require_special": true,
  "max_login_attempts": 5
}
Response:

json
{
  "success": true,
  "message": "Security settings updated successfully",
  "data": {
    "admin_session_timeout": 45,
    "enable_captcha_failed_attempts": true,
    "failed_attempts_threshold": 3,
    "lock_account_minutes": 60,
    "two_factor_enabled": true,
    "password_min_length": 12,
    "password_require_special": true,
    "max_login_attempts": 5
  }
}
5. Subscription Tiers Configuration
Get All Subscription Tiers

text
GET /subscription-tiers
Response:

json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "tier_name": "Community Supporter",
      "tier_level": 1,
      "monthly_price": 9.99,
      "price": 9.99,
      "benefits": ["10% bonus", "Priority support", "1 free ticket"],
      "free_jackpot_tickets": 1,
      "monthly_site_credit": 5.00,
      "badge_name": "Supporter",
      "subscriber_competition_access": true,
      "current_subscribers": 150,
      "created_at": "2024-01-15T10:30:00Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "tier_name": "Community Champion",
      "tier_level": 2,
      "monthly_price": 19.99,
      "price": 19.99,
      "benefits": ["15% bonus", "Priority support", "2 free tickets", "Monthly bonus"],
      "free_jackpot_tickets": 2,
      "monthly_site_credit": 10.00,
      "badge_name": "Champion",
      "subscriber_competition_access": true,
      "current_subscribers": 75,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
Get Single Tier

text
GET /subscription-tiers/:id
Path Parameters:

id (string, required): UUID of the subscription tier

Response:

json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "tier_name": "Community Supporter",
    "tier_level": 1,
    "monthly_price": 9.99,
    "price": 9.99,
    "benefits": ["10% bonus", "Priority support", "1 free ticket"],
    "free_jackpot_tickets": 1,
    "monthly_site_credit": 5.00,
    "badge_name": "Supporter",
    "subscriber_competition_access": true,
    "current_subscribers": 150,
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
}
Create Tier

text
POST /subscription-tiers
Request Body:

json
{
  "tier_name": "Community Hero",
  "tier_level": 3,
  "monthly_price": 29.99,
  "benefits": ["20% bonus", "VIP support", "3 free tickets", "Monthly bonus", "Priority entry"],
  "free_jackpot_tickets": 3,
  "monthly_site_credit": 15.00,
  "badge_name": "Hero",
  "subscriber_competition_access": true
}
Response:

json
{
  "success": true,
  "message": "Subscription tier created successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "tier_name": "Community Hero",
    "tier_level": 3,
    "monthly_price": 29.99,
    "price": 29.99,
    "benefits": ["20% bonus", "VIP support", "3 free tickets", "Monthly bonus", "Priority entry"],
    "free_jackpot_tickets": 3,
    "monthly_site_credit": 15.00,
    "badge_name": "Hero",
    "subscriber_competition_access": true,
    "current_subscribers": 0,
    "created_at": "2024-01-15T10:30:00Z"
  }
}
Update Tier

text
PUT /subscription-tiers/:id
Path Parameters:

id (string, required): UUID of the subscription tier

Request Body:

json
{
  "tier_name": "Community Champion Plus",
  "tier_level": 2,
  "monthly_price": 24.99,
  "benefits": ["15% bonus", "Priority support", "2 free tickets", "Monthly bonus", "Early access"],
  "free_jackpot_tickets": 2,
  "monthly_site_credit": 12.00,
  "badge_name": "Champion+",
  "subscriber_competition_access": true
}
Response:

json
{
  "success": true,
  "message": "Subscription tier updated successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "tier_name": "Community Champion Plus",
    "tier_level": 2,
    "monthly_price": 24.99,
    "price": 24.99,
    "benefits": ["15% bonus", "Priority support", "2 free tickets", "Monthly bonus", "Early access"],
    "free_jackpot_tickets": 2,
    "monthly_site_credit": 12.00,
    "badge_name": "Champion+",
    "subscriber_competition_access": true,
    "current_subscribers": 75,
    "updated_at": "2024-01-15T11:30:00Z"
  }
}
Delete Tier

text
DELETE /subscription-tiers/:id
Path Parameters:

id (string, required): UUID of the subscription tier

Response:

json
{
  "success": true,
  "message": "Subscription tier deleted successfully"
}
6. Notification Settings
Get Notification Settings

text
GET /notifications
Response:

json
{
  "success": true,
  "data": {
    "user_notifications": {
      "welcome_email": true,
      "competition_entry_confirmation": true,
      "winner_notification": true,
      "marketing_emails": false,
      "deposit_notification": true,
      "withdrawal_notification": true,
      "kyc_status_update": true,
      "referral_reward": true
    },
    "admin_notifications": {
      "new_user_signup": true,
      "new_deposit": true,
      "new_withdrawal": true,
      "kyc_submission": true,
      "competition_winner": true,
      "system_alerts": true,
      "partner_application": true,
      "contact_message": true
    },
    "email_templates": {
      "welcome_subject": "Welcome to Community Fortune!",
      "welcome_body": "Welcome {{username}}! Thank you for joining our community.",
      "winner_subject": "Congratulations! You Won!",
      "winner_body": "Congratulations {{username}}! You won {{prize}} in {{competition}}.",
      "deposit_subject": "Deposit Confirmation",
      "deposit_body": "Your deposit of {{amount}} has been confirmed.",
      "withdrawal_subject": "Withdrawal Request Received",
      "withdrawal_body": "Your withdrawal request for {{amount}} has been received."
    }
  }
}
Update Notification Settings

text
POST /notifications
Request Body:

json
{
  "user_notifications": {
    "welcome_email": true,
    "competition_entry_confirmation": true,
    "winner_notification": true,
    "marketing_emails": false,
    "deposit_notification": true,
    "withdrawal_notification": true,
    "kyc_status_update": true,
    "referral_reward": true
  },
  "admin_notifications": {
    "new_user_signup": true,
    "new_deposit": true,
    "new_withdrawal": true,
    "kyc_submission": true,
    "competition_winner": true,
    "system_alerts": true
  },
  "email_templates": {
    "welcome_subject": "Welcome to Community Fortune!",
    "welcome_body": "Welcome {{username}}! We're excited to have you join our community.",
    "winner_subject": "You're a Winner!",
    "winner_body": "Congratulations {{username}}! You've won {{prize}} in the {{competition}} competition."
  }
}
Response:

json
{
  "success": true,
  "message": "Notification settings updated successfully",
  "data": {
    "user_notifications": {
      "welcome_email": true,
      "competition_entry_confirmation": true,
      "winner_notification": true,
      "marketing_emails": false,
      "deposit_notification": true,
      "withdrawal_notification": true,
      "kyc_status_update": true,
      "referral_reward": true
    },
    "admin_notifications": {
      "new_user_signup": true,
      "new_deposit": true,
      "new_withdrawal": true,
      "kyc_submission": true,
      "competition_winner": true,
      "system_alerts": true
    },
    "email_templates": {
      "welcome_subject": "Welcome to Community Fortune!",
      "welcome_body": "Welcome {{username}}! We're excited to have you join our community.",
      "winner_subject": "You're a Winner!",
      "winner_body": "Congratulations {{username}}! You've won {{prize}} in the {{competition}} competition."
    }
  }
}
7. Legal & Compliance
Get All Legal Settings

text
GET /legal
Response:

json
{
  "success": true,
  "data": {
    "documents": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440010",
        "type": "TERMS",
        "title": "Terms and Conditions",
        "version": "2.1",
        "effective_date": "2024-01-01",
        "is_active": true,
        "updated_at": "2024-01-01T10:30:00Z"
      },
      {
        "id": "550e8400-e29b-41d4-a716-446655440011",
        "type": "PRIVACY",
        "title": "Privacy Policy",
        "version": "1.5",
        "effective_date": "2024-01-01",
        "is_active": true,
        "updated_at": "2024-01-01T10:30:00Z"
      }
    ],
    "age_verification_required": true
  }
}
Get Specific Legal Document

text
GET /legal/:type
Path Parameters:

type (string, required): Document type (TERMS, PRIVACY, COOKIE, RESPONSIBLE_PLAY, WEBSITE_TERMS)

Response:

json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440010",
    "title": "Terms and Conditions",
    "type": "TERMS",
    "content": "Full legal document content here...",
    "version": "2.1",
    "is_active": true,
    "effective_date": "2024-01-01",
    "updated_by": "Admin Name",
    "created_at": "2024-01-01T10:30:00Z",
    "updated_at": "2024-01-01T10:30:00Z"
  }
}
Update Legal Document

text
POST /legal/:type
Path Parameters:

type (string, required): Document type (TERMS, PRIVACY, COOKIE, RESPONSIBLE_PLAY, WEBSITE_TERMS)

Request Body:

json
{
  "title": "Updated Terms and Conditions",
  "content": "Updated legal content here...",
  "version": "2.2",
  "effective_date": "2024-02-01"
}
Response:

json
{
  "success": true,
  "message": "Legal document updated successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440010",
    "title": "Updated Terms and Conditions",
    "type": "TERMS",
    "content": "Updated legal content here...",
    "version": "2.2",
    "is_active": true,
    "effective_date": "2024-02-01",
    "updated_by": "Admin Name",
    "updated_at": "2024-01-15T10:30:00Z"
  }
}
Age Verification Settings

text
GET /age-verification
Response:

json
{
  "success": true,
  "data": {
    "require_age_verification": true,
    "minimum_age": 18,
    "verification_method": "DOCUMENT_UPLOAD"
  }
}
Update Age Verification Settings

text
POST /age-verification
Request Body:

json
{
  "require_age_verification": true
}
Response:

json
{
  "success": true,
  "message": "Age verification settings updated successfully",
  "data": {
    "require_age_verification": true,
    "minimum_age": 18,
    "verification_method": "DOCUMENT_UPLOAD"
  }
}
8. Contact Settings
Get Contact Settings

text
GET /contact
Response:

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
Update Contact Settings

text
POST /contact
Request Body:

json
{
  "company_name": "Community Fortune Ltd",
  "contact_email": "info@community-fortune.com",
  "support_email": "help@community-fortune.com",
  "phone_number": "+44 1234 567891",
  "business_hours": "Mon-Fri: 8:00 AM - 7:00 PM GMT"
}
Response:

json
{
  "success": true,
  "message": "Contact settings updated successfully",
  "data": {
    "company_name": "Community Fortune Ltd",
    "contact_email": "info@community-fortune.com",
    "website_url": "www.community-fortune.com",
    "address_line1": "194 Harrington Road",
    "address_line2": "Workington, Cumbria",
    "address_line3": "United Kingdom, CA14 3UJ",
    "support_email": "help@community-fortune.com",
    "business_hours": "Mon-Fri: 8:00 AM - 7:00 PM GMT",
    "phone_number": "+44 1234 567891",
    "response_time": "24-48 hours"
  }
}
9. FAQ Settings
Get All FAQs

text
GET /faqs
Response:

json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440020",
      "scope": "HOME",
      "question": "How do I enter competitions?",
      "answer": "You can enter competitions by purchasing tickets...",
      "is_published": true,
      "sort_order": 1,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440021",
      "scope": "SUBSCRIPTION",
      "question": "What are the subscription benefits?",
      "answer": "Subscribers get monthly credits, free tickets...",
      "is_published": true,
      "sort_order": 1,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ]
}
Get FAQs by Scope

text
GET /faqs/:scope
Path Parameters:

scope (string, required): FAQ scope (HOME, SUBSCRIPTION)

Response:

json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440020",
      "scope": "HOME",
      "question": "How do I enter competitions?",
      "answer": "You can enter competitions by purchasing tickets...",
      "is_published": true,
      "sort_order": 1,
      "created_at": "2024-01-15T10:30:00Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440022",
      "scope": "HOME",
      "question": "How are winners selected?",
      "answer": "Winners are selected through a random draw...",
      "is_published": true,
      "sort_order": 2,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
Create FAQ

text
POST /faqs
Request Body:

json
{
  "scope": "HOME",
  "question": "What payment methods do you accept?",
  "answer": "We accept credit/debit cards, PayPal, and bank transfers.",
  "is_published": true,
  "sort_order": 3
}
Response:

json
{
  "success": true,
  "message": "FAQ created successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440023",
    "scope": "HOME",
    "question": "What payment methods do you accept?",
    "answer": "We accept credit/debit cards, PayPal, and bank transfers.",
    "is_published": true,
    "sort_order": 3,
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
}
Update FAQ

text
PUT /faqs/:id
Path Parameters:

id (string, required): UUID of the FAQ

Request Body:

json
{
  "scope": "HOME",
  "question": "What payment methods are accepted?",
  "answer": "We accept Visa, Mastercard, PayPal, and Revolut.",
  "is_published": true,
  "sort_order": 4
}
Response:

json
{
  "success": true,
  "message": "FAQ updated successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440023",
    "scope": "HOME",
    "question": "What payment methods are accepted?",
    "answer": "We accept Visa, Mastercard, PayPal, and Revolut.",
    "is_published": true,
    "sort_order": 4,
    "updated_at": "2024-01-15T11:30:00Z"
  }
}
Delete FAQ

text
DELETE /faqs/:id
Path Parameters:

id (string, required): UUID of the FAQ

Response:

json
{
  "success": true,
  "message": "FAQ deleted successfully"
}
10. Voucher Settings
Get All Vouchers

text
GET /vouchers
Response:

json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440030",
      "code": "WELCOME10",
      "campaign_name": "Welcome Bonus",
      "voucher_type": "SINGLE_USE",
      "reward_type": "SITE_CREDIT",
      "reward_value": 10.00,
      "start_date": "2024-01-01T00:00:00Z",
      "expiry_date": "2024-12-31T23:59:59Z",
      "usage_limit": 100,
      "usage_count": 45,
      "status": "ACTIVE",
      "created_by": "550e8400-e29b-41d4-a716-446655440001",
      "created_at": "2024-01-01T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "remaining_uses": 55,
      "effective_status": "ACTIVE"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440031",
      "code": "SUMMER25",
      "campaign_name": "Summer Sale",
      "voucher_type": "MULTI_USE",
      "reward_type": "DISCOUNT_PERCENT",
      "reward_value": 25.00,
      "start_date": "2024-06-01T00:00:00Z",
      "expiry_date": "2024-08-31T23:59:59Z",
      "usage_limit": 500,
      "usage_count": 127,
      "status": "ACTIVE",
      "created_by": "550e8400-e29b-41d4-a716-446655440001",
      "created_at": "2024-06-01T10:30:00Z",
      "updated_at": "2024-07-15T10:30:00Z",
      "remaining_uses": 373,
      "effective_status": "ACTIVE"
    }
  ]
}
Create Voucher

text
POST /vouchers
Request Body:

json
{
  "code": "WINTER20",
  "campaign_name": "Winter Promotion",
  "voucher_type": "SINGLE_USE",
  "reward_type": "SITE_CREDIT",
  "reward_value": 20.00,
  "start_date": "2024-12-01T00:00:00Z",
  "expiry_date": "2024-12-31T23:59:59Z",
  "usage_limit": 200,
  "code_prefix": "WIN",
  "status": "ACTIVE"
}
Response:

json
{
  "success": true,
  "message": "Voucher created successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440032",
    "code": "WINTER20",
    "campaign_name": "Winter Promotion",
    "voucher_type": "SINGLE_USE",
    "reward_type": "SITE_CREDIT",
    "reward_value": 20.00,
    "start_date": "2024-12-01T00:00:00Z",
    "expiry_date": "2024-12-31T23:59:59Z",
    "usage_limit": 200,
    "usage_count": 0,
    "status": "ACTIVE",
    "created_by": "550e8400-e29b-41d4-a716-446655440001",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
}
Update Voucher

text
PUT /vouchers/:id
Path Parameters:

id (string, required): UUID of the voucher

Request Body:

json
{
  "campaign_name": "Winter Special",
  "reward_value": 25.00,
  "expiry_date": "2025-01-15T23:59:59Z",
  "usage_limit": 300,
  "status": "ACTIVE"
}
Response:

json
{
  "success": true,
  "message": "Voucher updated successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440032",
    "code": "WINTER20",
    "campaign_name": "Winter Special",
    "voucher_type": "SINGLE_USE",
    "reward_type": "SITE_CREDIT",
    "reward_value": 25.00,
    "start_date": "2024-12-01T00:00:00Z",
    "expiry_date": "2025-01-15T23:59:59Z",
    "usage_limit": 300,
    "usage_count": 0,
    "status": "ACTIVE",
    "updated_at": "2024-01-15T11:30:00Z"
  }
}
Delete Voucher

text
DELETE /vouchers/:id
Path Parameters:

id (string, required): UUID of the voucher

Response:

json
{
  "success": true,
  "message": "Voucher deleted successfully"
}
11. System Settings
Get System Settings

text
GET /system
Response:

json
{
  "success": true,
  "data": {
    "site_name": "Community Fortune",
    "site_url": "https://community-fortune.com",
    "support_email": "support@community-fortune.com",
    "default_currency": "GBP",
    "timezone": "Europe/London",
    "date_format": "DD/MM/YYYY",
    "items_per_page": 20,
    "enable_registration": true,
    "enable_email_verification": true,
    "enable_kyc_verification": true,
    "referral_enabled": true,
    "social_sharing_enabled": true,
    "game_leaderboard_enabled": true,
    "maintenance_mode": false,
    "enable_two_factor": false,
    "max_file_size_mb": 10,
    "allowed_file_types": "jpg,jpeg,png,pdf"
  }
}
Update System Settings

text
POST /system
Request Body:

json
{
  "site_name": "Community Fortune UK",
  "default_currency": "GBP",
  "timezone": "Europe/London",
  "date_format": "DD/MM/YYYY",
  "items_per_page": 25,
  "enable_registration": true,
  "enable_email_verification": true,
  "enable_kyc_verification": true,
  "referral_enabled": true,
  "social_sharing_enabled": true,
  "max_file_size_mb": 15,
  "allowed_file_types": "jpg,jpeg,png,pdf,doc,docx"
}
Response:

json
{
  "success": true,
  "message": "System settings updated successfully",
  "data": {
    "site_name": "Community Fortune UK",
    "site_url": "https://community-fortune.com",
    "support_email": "support@community-fortune.com",
    "default_currency": "GBP",
    "timezone": "Europe/London",
    "date_format": "DD/MM/YYYY",
    "items_per_page": 25,
    "enable_registration": true,
    "enable_email_verification": true,
    "enable_kyc_verification": true,
    "referral_enabled": true,
    "social_sharing_enabled": true,
    "game_leaderboard_enabled": true,
    "maintenance_mode": false,
    "max_file_size_mb": 15,
    "allowed_file_types": "jpg,jpeg,png,pdf,doc,docx"
  }
}
Error Responses
All endpoints return consistent error formats:

400 Bad Request (Validation Error)
json
{
  "success": false,
  "message": "Validation error",
  "errors": {
    "min_deposit": "Minimum deposit must be at least £10",
    "max_deposit": "Maximum deposit must not exceed £10000"
  }
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
  "message": "Insufficient permissions. SUPERADMIN role required."
}
404 Not Found
json
{
  "success": false,
  "message": "Resource not found"
}
409 Conflict
json
{
  "success": false,
  "message": "Subscription tier level already exists"
}
500 Internal Server Error
json
{
  "success": false,
  "message": "Internal server error",
  "error": "Database connection failed"
}
Status Codes Summary
200: Success

201: Created successfully

400: Validation error or bad request

401: Unauthorized (no token/invalid token)

403: Forbidden (insufficient permissions)

404: Resource not found

409: Conflict (duplicate resource)

500: Server error