# Corp-FuelAdjustments (.NET 8)

Minimal API for Brent-based fuel adjustment rollout with:

- Configurable feature flag and D-X execution.
- Brent snapshot ingestion from Google Finance (`BZW00:NYMEX`) for fast operational use.
- Configurable Brent USD/bbl tier table -> EUR/pax adjustments.
- Per-passenger, per-segment calculation and idempotent processing.
- Audit persistence in SQLite with snapshot, band, action, and status.
- HTML dashboard (`/dashboard`) to view relevant data.

## Run

```bash
dotnet restore
dotnet run --project Corp-FuelAdjustments/Corp.FuelAdjustments.csproj
```

## Main endpoints

- `POST /api/brent/refresh`: pulls latest Brent from Google and stores snapshot.
- `GET /api/brent/latest`: latest snapshot used for audit.
- `POST /api/adjustments/run-dx?processingDateUtc=2026-03-20`: runs D-X adjustments.
- `GET /api/adjustments`: adjustment audit rows.
- `GET /dashboard`: HTML view for operational monitoring.

## Notes

- Boundaries are implemented as **lower exclusive** and **upper inclusive**.
- Processing is idempotent by `(segment_id, departure_date_utc)` unique constraint.
- For now this implementation focuses on data capture + calculation + view, no email flow.
