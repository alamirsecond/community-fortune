# Instant Wins and Achievements Images

This note explains how to send instant wins and achievements with their own images when creating or updating a competition.

## Key Rule
- Instant win images use the field name `instant_win_images`.
- Achievement images use the field name `achievement_images`.

These are different data sets and must be uploaded separately.

## Create Competition (multipart/form-data)

Required JSON fields (as strings in form-data):
- `instant_wins`: JSON array
- `achievements`: JSON array

File fields:
- `instant_win_images`: array of files (align by index with `instant_wins`)
- `achievement_images`: array of files (align by index with `achievements`)

### Example (fields)

```
POST /api/competitions
Content-Type: multipart/form-data

instant_wins: [
  {
    "prize_name": "Prize A",
    "prize_amount": 10,
    "payout_type": "CASH",
    "ticket_numbers": [5, 10, 22],
    "max_count": 3
  },
  {
    "prize_name": "Prize B",
    "prize_amount": 5,
    "payout_type": "POINTS",
    "ticket_numbers": [7],
    "max_count": 1
  }
]

achievements: [
  {
    "title": "First Purchase",
    "description": "Make your first purchase",
    "type": "FIRST_PURCHASE",
    "points_awarded": 50
  },
  {
    "title": "Buy 5 Tickets",
    "description": "Purchase 5 tickets",
    "type": "PURCHASE_X_TICKETS",
    "condition_value": 5,
    "points_awarded": 100
  }
]

instant_win_images: [file0, file1]
achievement_images: [file0, file1]
```

## Update Competition (multipart/form-data)

Use the same fields as create:
- `instant_wins` + `instant_win_images`
- `achievements` + `achievement_images`

Make sure the image arrays match the index of the items in each JSON array.

## Notes
- If you send only one image in a list, it can be reused for all items in that list.
- Keep instant wins and achievements separate so each uses its own image field.
