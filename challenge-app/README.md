# DealForge (Commercial MVP)

DealForge is a browser-first Revenue Ops app that combines:

- Quote builder with discount, tax, delivery cost, and margin math
- ROI estimator with payback period
- Weighted sales pipeline forecast
- Local persistence plus JSON export/import

## Run locally

From this repository root:

```bash
cd /home/butterfly/apps/kensgames-portal
python3 -m http.server 8000
```

Open:

- `http://localhost:8000/challenge-app/`

## Fast path to monetization

1. Add authentication and team workspaces.
2. Add Stripe subscription billing.
3. Add cloud sync (Postgres/Supabase/Firebase).
4. Gate export templates and CRM integrations behind paid tiers.

## Suggested pricing

- Starter: $19/user/month
- Growth: $49/user/month with integrations
- Agency: $149/month with branded PDF outputs and team seats
