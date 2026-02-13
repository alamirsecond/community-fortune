# src/api/Competition/competitionController.js

## Purpose
Allow competitions to transition into an `INACTIVE` state through the admin status endpoint.

## Key Updates
- Expanded the allowed status list in `updateCompetitionStatus` to include `INACTIVE`, preventing legitimate transitions from being rejected as invalid.
- Kept auditing metadata, IP capture, and update flows unchanged so downstream persistence continues as before.
- Normalized `rules_and_restrictions` payloads during create/update operations and surfaced them in list/detail responses so the admin UI can display the same rule copy the frontend enforces.

## Integration Notes
This small change aligns the controller with the status values supported by the underlying model and admin UI, avoiding manual data fixes when competitions are paused long term.
