# Backend

## Render Disk uploads

Render wipes the filesystem on deploy/restart. To make uploads persistent, use a Render Disk and point uploads to it.

1. Create a Render Disk and mount it (for example: `/var/data`).
2. Set `UPLOAD_ROOT=/var/data/uploads` in Render environment variables.
3. Redeploy the service.
4. Re-upload files (old uploads are not recoverable after a wipe).

Optional: set explicit paths if you prefer different folders:
- `KYC_UPLOAD_PATH=/var/data/uploads/kyc_documents`
- `COMPETITION_UPLOAD_PATH=/var/data/uploads/competitions`
- `USER_UPLOAD_PATH=/var/data/uploads/users`
- `GAMES_UPLOAD_PATH=/var/data/uploads/games`
- `SPIN_WHEEL_UPLOAD_PATH=/var/data/uploads/spin_wheels`
