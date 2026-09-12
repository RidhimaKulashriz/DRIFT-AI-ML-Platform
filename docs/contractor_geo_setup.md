# Contractor Geo-Boundary Setup

## Overview

Contractors are automatically assigned to defects based on GPS coordinates of the detection location. Each contractor has a geo-boundary polygon defined by latitude/longitude points.

## Current Contractors

| Contractor | Email | Region | Center GPS |
|-----------|-------|--------|-----------|
| Manu | ridhimakulashri07042025@gmail.com | IGDTUW Campus | 28.6876, 77.2100 |
| Ridhima Kulashriz | ridhimakulashriz@gmail.com | IIIT-Delhi Campus | 28.5449, 77.2750 |

## How It Works

1. **ML detects a defect** with GPS coordinates
2. **Backend looks up** which contractor's geo-boundary contains those coordinates
3. **If no match found**, falls back to infrastructure-type default
4. **Ticket is generated** with contractor details
5. **Email is sent** to the matched contractor

## Adding New Contractors

Edit `shared/contractors.ts`:

```typescript
export const contractors: Contractor[] = [
  // Add new entry:
  {
    id: 3,
    name: "New Contractor",
    email: "contractor@example.com",
    phone: "+91-XXXX-XXXX-03",
    organization: "Contractor Organization",
    specialization: ["roads", "bridges"],
    geoBoundary: [
      [lat1, lng1], [lat1, lng2],
      [lat2, lng2], [lat2, lng1],
    ],
    centerLat: centerLat,
    centerLng: centerLng,
    radiusDegrees: 0.005, // ~500m radius
    region: "Region Name",
    rating: 4.0,
  },
];
```

## Email Configuration

### Option 1: Webhook (Recommended for Demo)
Set `DRIFT_EMAIL_WEBHOOK_URL` in `.env` to point to a webhook service (Zapier, n8n, etc.) that forwards the report email.

### Option 2: SMTP Relay
Set `DRIFT_SMTP_URL` to point to a simple SMTP relay server.

### Option 3: Console Fallback (Default)
If neither is configured, emails are logged to the console.

## Priority Scoring Formula

```
Overall Priority = Defect Severity (30) + ML Confidence (20) + Traffic Impact (25) + Sensor Anomaly (15) + Infrastructure Importance (10)
```

Total: 0-100 points

| Score | Level | Action |
|-------|-------|--------|
| 80-100 | Critical | Emergency dispatch within 4 hours |
| 60-79 | High | Engineer review within 24 hours |
| 35-59 | Moderate | Schedule in next maintenance cycle |
| 0-34 | Low | Monitor and verify on next pass |
