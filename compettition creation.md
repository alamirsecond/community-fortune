

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

// Split random vs first entry winners
// ticket_numbers contains ONLY the random winners (length = random_count)
instant_wins: '[{
  "prize_name": "£50 Amazon Voucher",
  "prize_amount": 50,
  "payout_type": "SITE_CREDIT",
  "ticket_numbers": [],
  "max_count": 5,
  "random_count": 3,
  "first_entry_count": 2,
  "image_url": "https://example.com/voucher.jpg",
  "description": "Digital Amazon gift card"
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
📜 Rules & Restrictions (Textarea → JSON)
```javascript
// Recommended: build array client-side then JSON.stringify when using multipart/form-data
rules_and_restrictions: '[{
  "title": "18+ only",
  "description": "Winners must provide valid ID"
}, {
  "title": "UK residents",
  "description": "Prize fulfillment limited to mainland UK"
}]'

// If admins type plain text lines in a textarea, split on new lines and map to objects before sending:
const rulesArray = textareaValue
  .split('\n')
  .map(line => line.trim())
  .filter(Boolean)
  .map(line => ({ title: line }));
formData.append('rules_and_restrictions', JSON.stringify(rulesArray));
```
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
