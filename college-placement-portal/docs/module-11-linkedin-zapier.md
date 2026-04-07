# Module 11 — LinkedIn Announcement via Zapier Webhook

This module allows the Placement Coordinator to publish LinkedIn placement announcements automatically via Zapier, triggered either automatically upon result declaration or manually from the Admin Dashboard.

---

## How It Works

1. When a SPOC declares results via `POST /api/jobs/:id/results`, the server automatically calls the LinkedIn announcement service.
2. The service builds a structured payload from the placement records (fetching student names, branches, and LinkedIn URLs from their profiles).
3. Based on the `ZAPIER_LINKEDIN_ENABLED` setting (togglable from Admin UI or `.env`), the payload is either:
   - **Sent** to `ZAPIER_WEBHOOK_URL` (Zapier catches it and posts to LinkedIn), or
   - **Mocked** — logged locally with status `MOCKED` (for dev/testing).
4. Each attempt is saved in the `PlacementAnnouncementLog` table.

---

## Environment Configuration

Add to your `.env`:

```env
ZAPIER_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/xxxxxxx/yyyyyyy/
ZAPIER_LINKEDIN_ENABLED=true   # Set to false to mock all sends
```

---

## Zapier Webhook Setup

1. Go to [zapier.com](https://zapier.com) → **Create Zap**
2. **Trigger**: Choose **Webhooks by Zapier** → **Catch Hook**
3. Copy your webhook URL and set it as `ZAPIER_WEBHOOK_URL` in `.env`
4. **Action**: LinkedIn → **Create a Post** (or share an update)
5. Map the fields:
   - `post_template` → LinkedIn post body
   - `company_name` → caption / title
6. Test the Zap and publish

---

## Sample Webhook Payload

```json
{
  "company_name": "ACME Corp",
  "job_id": "abc123-job-uuid",
  "placement_year": 2026,
  "placed_students": [
    {
      "name": "Arjun Singh",
      "branch": "CSE",
      "linkedin_url": "https://www.linkedin.com/in/arjun",
      "role": "Backend SDE",
      "ctc": "6 LPA"
    },
    {
      "name": "Priya Sharma",
      "branch": "IT",
      "linkedin_url": "https://www.linkedin.com/in/priya",
      "role": "Data Analyst",
      "ctc": "5.5 LPA"
    }
  ],
  "post_template": "🎉 Placement Announcement 🎉\nWe are proud to announce that the following students have been placed at ACME Corp:\n• Arjun Singh (CSE) — Backend SDE @ 6 LPA\n• Priya Sharma (IT) — Data Analyst @ 5.5 LPA\n#Placements #TPCC #PlacementDrive"
}
```

---

## API Endpoints

| Method | Route | Access | Description |
|--------|-------|--------|-------------|
| `POST` | `/api/announcements/job/:job_id/publish` | COORDINATOR | Manually trigger LinkedIn publish for a job |
| `GET` | `/api/announcements/linkedin/logs` | COORDINATOR | View publish history |
| `GET` | `/api/announcements/linkedin/settings` | COORDINATOR | Get current toggle state |
| `PATCH` | `/api/announcements/linkedin/settings` | COORDINATOR | Toggle LinkedIn enabled/disabled |

---

## PlacementAnnouncementLog Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `jobId` | UUID? | Nullable if manually triggered |
| `companyName` | String | |
| `placementYear` | Int | e.g. 2026 |
| `postedByUserId` | UUID | Coordinator who triggered it |
| `zapStatus` | String | `SUCCESS`, `FAILED`, `MOCKED` |
| `responseBody` | Text? | Zapier response body |
| `payload` | Json | Full payload sent |
| `postedAt` | DateTime? | Only set on SUCCESS |
| `createdAt` | DateTime | Log creation timestamp |
