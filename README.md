# Sunrise Villa Management

Private operations for Sunrise and Windmill villas, hosted as a static website with Supabase authentication and cloud storage.

## Everyday Flow

- **Today / Calendar:** arrivals, current stays, departures, and collection/refund follow-up.
- **Bookings / Guests:** booking records and guest history. The selected month follows the sidebar; choose All months explicitly when needed.
- **Messages:** Quick Quotation for new enquiries; Check-in Flow for confirmed guests.
- **Dashboard:** separate monthly cash planning and selected-year outlook.
- **Documents:** Create / edit or Saved documents. Choose Official Receipt to record multiple transfers, each with bank details, reference, date, and amount. A saved partial receipt can produce a balance-payment invoice.
- **Tax Plan:** expense records, assets and review aids. This is not a professional tax sign-off.

## Saving And Recovery

Sign in with your own Supabase account. The workspace opens only after its cloud data loads.
Wait for **All changes saved** before closing. A failed save stays visible.
Concurrent-device edits pause saving instead of silently overwriting another device.

For a save conflict, download the local JSON backup, then use Load cloud copy. Compare and re-enter the intended changes. Do not repeatedly force-upload an older backup.

Data tools provides JSON export/import and local recovery history. Recovery snapshots are limited by browser storage and may omit attachment images; they are not independent server backups. JSON exports contain private data and must be stored securely. Signing out clears this browser's local cache and recovery history. Keep independent JSON exports, including receipt attachments, before major changes.

## Financial Basis

Accommodation fees and booking-level received/balance totals are assigned to the **check-in month**, not counted again in every month crossed by a stay. Occupancy counts actual occupied nights, excluding checkout. Weekends are Friday, Saturday and Sunday. Inquiries and complimentary stays are excluded from financial calculations.

Nightly-rate analysis apportions a booking's accommodation fee evenly across its nights; it does not reconstruct separately priced weekdays and weekends.

Net after costs & loans is a planning figure, not taxable/accounting profit or a bank statement: it includes loan repayments and can include unpaid booking fees. Refundable deposits are not accommodation income.

Legacy untagged costs belong to Sunrise. New recurring commitments have a villa and start month; expiry includes the last payment month. Monthly overrides and one-off costs are stored separately for each villa. Tax records remain a separate ledger, not an automatic second expense deduction.

## Run Or Deploy

Open index.html locally, or serve this folder with a static server.
GitHub Pages publishes the repository root. Required runtime files:

- index.html
- app.js
- styles.css
- framebuster.js
- vendor/supabase-js-2.108.2.min.js

Keep all runtime files together. Do not paste this static version into Google Apps Script.
Versioned CSS/JS URLs are bumped together on releases to reduce stale-cache problems.
Never commit guest exports, receipts, passwords, service-role keys or access tokens.

## Tests

Requires Node.js and Chromium:

```sh
npm install
npx playwright install chromium
npm test
```

Tests use synthetic bookings, mock Supabase writes, and block external HTTPS requests. No real guests are created or edited.
The regression suite covers payments, receipts, balance invoices, backup validation, account isolation and concurrent saves.
The layout suite checks all nine sections at 1440, 1080 and 390 pixels.

Set AUDIT_OUTPUT to choose a screenshot/PDF output directory. PLAYWRIGHT_PATH can point to an existing Playwright installation. Generated PDFs use fictional guest details.

## Server Requirements

Client checks are not database authorization. Supabase must enforce owner-only row-level security, including insert/update ownership checks. The snapshot table also needs a unique key on (user_id, data_type, record_key). Administrative RLS, storage, edge functions, account restrictions and independent server backups must be reviewed in Supabase; the static-site repository cannot establish their live configuration.
