# Create Competition With Instant Wins (Multipart Form-Data)

## Endpoint
- POST /api/competition
- Auth: Bearer token with role ADMIN or SUPERADMIN
- Content-Type: multipart/form-data

## Required core fields
- title (text)
- price (number)
- total_tickets (number)
- category (PAID|FREE|JACKPOT|MINI_GAME|SUBSCRIPTION|VIP|INSTANT_WIN|ROLLING)
- type (STANDARD|MANUAL_DRAW|AUTO_DRAW)
- start_date (ISO string)
- end_date (ISO string or empty if no_end_date=true)
- competition_type (PAID|FREE)

## Instant win payload
- instant_win_enabled: true
- instant_wins: JSON string array of objects. Each object supports:
  - prize_name (string)
  - prize_amount (number)
  - payout_type (CASH|SITE_CREDIT|POINTS|FREE_ENTRY|PHYSICAL_PRIZE)
  - ticket_numbers (array of numbers)
  - max_count (int)
  - random_count (int, optional)
  - first_entry_count (int, optional)
  - image_url (optional; filled automatically when uploading files)
  - description (optional)

## File fields
- instant_win_images: one or many image files. If one file is provided it will be reused for all instant wins. If multiple files are provided, they map by index to instant_wins[0], instant_wins[1], etc.
- featured_image, banner_image, gallery_images: optional competition assets.

## Example: single image reused for all instant wins (curl)
```
curl -X POST https://your-api.example.com/api/competition \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -F "title=Instant Win Demo" \
  -F "price=5" \
  -F "total_tickets=1000" \
  -F "category=PAID" \
  -F "type=STANDARD" \
  -F "start_date=2026-02-15T00:00:00Z" \
  -F "end_date=2026-03-15T00:00:00Z" \
  -F "competition_type=PAID" \
  -F "instant_win_enabled=true" \
  -F "instant_wins=[{\"prize_name\":\"Gift Card\",\"prize_amount\":50,\"payout_type\":\"CASH\",\"ticket_numbers\":[1,2,3],\"max_count\":3}]" \
  -F "instant_win_images=@/path/to/one-image.jpg"
```

## Example: per-instant-win images
```
curl -X POST https://your-api.example.com/api/competition \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -F "title=Instant Win Multi" \
  -F "price=5" \
  -F "total_tickets=1000" \
  -F "category=PAID" \
  -F "type=STANDARD" \
  -F "start_date=2026-02-15T00:00:00Z" \
  -F "end_date=2026-03-15T00:00:00Z" \
  -F "competition_type=PAID" \
  -F "instant_win_enabled=true" \
  -F "instant_wins=[{\"prize_name\":\"Card A\",\"prize_amount\":25,\"payout_type\":\"CASH\",\"ticket_numbers\":[10],\"max_count\":1},{\"prize_name\":\"Card B\",\"prize_amount\":30,\"payout_type\":\"CASH\",\"ticket_numbers\":[20],\"max_count\":1}]" \
  -F "instant_win_images=@/path/to/a.jpg" \
  -F "instant_win_images=@/path/to/b.jpg"
```

## Notes
- One uploaded image populates all instant wins; multiple files map by order. Existing image_url values remain if no corresponding file is provided.
- image_url is optional/nullable in validation; file uploads will supply URLs automatically.
- Keep field names exact: instant_win_images, instant_wins, featured_image, banner_image, gallery_images.
- For updates (PUT /api/competition/:id), send the same fields; new instant_win_images will replace/add image_url values following the same mapping rules.
