# Sunrise Villa Management

Private operations for Sunrise and Windmill villas, hosted as a static website with Supabase authentication and cloud storage.

## Everyday Flow

- **Today / Calendar:** arrivals, current stays, departures, and collection/refund follow-up.
- **Bookings:** booking records and the Guest Book subview. A guest name opens one workspace with payments, documents and message history. The selected month follows the sidebar; choose All months explicitly when needed.
- **Messages:** Quick Quotation for new enquiries; Check-in Flow for confirmed guests.
- **Finance:** Reports, Payments and Expenses. Reports retain separate monthly cash planning and selected-year outlook. Payments shows dated transfers and unresolved balances.
- **Documents:** Create / edit or Saved documents. Choose Official Receipt to record multiple transfers, each with bank details, reference, date, and amount. A saved partial receipt can produce a balance-payment invoice.
- **Tax Plan:** planning, assets and review aids, with a link to the shared Expense Records. This is not a professional tax sign-off.
- **Settings:** property guidebook, appearance and backup access. Rates and message templates remain editable under their collapsed controls in Messages.

## Saving And Recovery

Sign in with your own Supabase account. The workspace opens only after its cloud data loads.
Wait for **All changes saved** before closing. A failed save stays visible.
Concurrent-device edits pause saving instead of silently overwriting another device.

For a save conflict, download the local JSON backup, then use Load cloud copy. Compare and re-enter the intended changes. Do not repeatedly force-upload an older backup.

Cloud replacement now keeps pending edits marked unsaved until a valid cloud response is ready and a local recovery point has been stored. An outage, failed recovery write, or edit made during the read stops replacement. Saves wait until the read settles. If a previously known cloud workspace is missing, local records are kept and saving pauses instead of uploading a new empty workspace. Duplicate cloud rows, missing save versions, and an unexpected workspace owner require investigation; the app does not silently choose or delete records. Only a genuinely new account initializes an empty workspace. Browser recovery omits attachment images, so keep a full independent export before resolving conflicts.

Data tools provides encrypted or plain JSON export/import and local recovery history. Recovery snapshots are limited by browser storage and may omit attachment images; they are not independent server backups. JSON exports contain private data and must be stored securely. Signing out clears this browser's local cache and recovery history. Keep independent JSON exports, including receipt attachments, before major changes.

Restore now opens a comparison of added, changed and removed records before applying anything. Download the current full JSON copy first. A browser recovery point must be saved successfully before a manual restore can replace records. Restores stop on account mismatch, cloud conflict or edits made after the preview opened. Older bookings-only files leave absent collections unchanged. Matching current attachments can be retained when the backup contains only their filenames; missing images are reported, not recreated.

## Protected Backup Files

Use **Data tools > Encrypted backup** or **Settings > Backups** for a password-protected full workspace export. Use a separate passphrase of at least 14 characters and keep it in a password manager, apart from the backup. The application cannot reset a lost backup passphrase. This does not change the login password.

The `.svbackup.json` file uses the browser's Web Crypto AES-256-GCM authenticated encryption with a fresh 16-byte salt and 12-byte IV, a 128-bit tag, and PBKDF2-HMAC-SHA-256 (600,000 iterations). Passwords and encryption keys are not saved to browser storage, included in the file, or sent to Supabase. This protects the exported file, not an unlocked browser, local browser caches or the server database. Plain JSON export remains available and is not encrypted.

Use **Settings > Check backup file** to reopen either format, check its structure and identify missing attachment contents without replacing records. This is a file check, not a complete server restore drill. Importing an encrypted backup asks for its passphrase, then follows the normal restore comparison and explicit confirmation. Exports record a download request, not proof that the browser saved the file; check Downloads and keep an independent copy elsewhere. Exports include full embedded receipt files. The encryption payload limit is 64 MB; file imports are limited to 90 MB. Larger archives require an operator-managed database backup.

The encrypted envelope has its own format version 1; the enclosed app snapshot remains version 3. Encrypted files require this release or newer. Source:
- [Web Crypto authenticated encryption](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt)
- [Web Crypto key derivation](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey)

## Financial Basis

Accommodation fees and booking-level received/balance totals are assigned to the **check-in month**, not counted again in every month crossed by a stay. Occupancy counts actual occupied nights, excluding checkout. Weekends are Friday, Saturday and Sunday. Inquiries and complimentary stays are excluded from financial calculations.

Nightly-rate analysis apportions a booking's accommodation fee evenly across its nights; it does not reconstruct separately priced weekdays and weekends.

Net after costs & loans is a planning figure, not taxable/accounting profit or a bank statement: it includes loan repayments and can include unpaid booking fees. Refundable deposits are not accommodation income.

Legacy untagged costs belong to Sunrise. New recurring commitments have a villa and start month; expiry includes the last payment month. Monthly overrides and one-off costs are stored separately for each villa. New Expense Records can feed both Finance and tax review. Choose Additional actual expense, Replaces a recurring commitment, or Tax record only. Actual commitment entries replace the planned amount for that month rather than being added to it. Existing tax records default to Not reconciled and do not change historical Finance totals without explicit review. Earlier one-off costs remain preserved in their existing monthly editor. Finance > Expenses > Review older costs lists historical entries. Link an existing receipt using Already in monthly costs, or enter the actual receipt date for a new linked record. Links require matching property, month and amount and do not add another Finance charge. Editing a linked amount updates its original cost too; deleting a linked receipt keeps the original cost. Possible duplicates require explicit review, and invalid links block a restore. Aggregate legacy cost fields and automatic tax classification are not migrated by this process.

## Payments And Documents

Legacy received totals are preserved. Recording the first detailed transfer creates a payment history with an opening amount for previously recorded money. Match previously recorded money to add bank/reference/date details without increasing the total; choose New money received only for an additional transfer. Unknown historical dates are not invented. Corrections and voided transfers remain in the history.

Saving, duplicating or printing a receipt does not post money. Use Record in booking explicitly. Transfer IDs and reference/date/amount checks prevent repeated posting. Receipts can reference existing transfers and show other previously received money separately. Balance invoices for linked bookings use the booking's received total. Amend issued receipts separately if a transfer is voided.

Opening WhatsApp does not confirm delivery. Use Mark sent, or the calendar W/A checkbox, once the message has actually been sent. Both update the same check-in status.

## Run Or Deploy

Open index.html locally, or serve this folder with a static server.
GitHub Pages publishes the repository root. Required runtime files:

- index.html
- app.js
- workflow-core.js
- workspace.js
- recovery.js
- expense-review.js
- backup-crypto.js
- backup-ui.js
- styles.css
- workflow.css
- framebuster.js
- vendor/supabase-js-2.108.2.min.js

Keep all runtime files together. Do not paste this static version into Google Apps Script.
Versioned CSS/JS URLs are bumped together on releases to reduce stale-cache problems. This release exports backup format 3; older backups remain supported. Refresh all devices before editing after deployment, and retain a full JSON export before rollout. The cloud storage schema has not been migrated to per-record tables.
Never commit guest exports, receipts, passwords, service-role keys or access tokens.

## Tests

Requires Node.js and Chromium:

```sh
npm install
npx playwright install chromium
npm test
```

Tests use synthetic bookings, mock Supabase writes, and block external HTTPS requests. No real guests are created or edited.
The regression suite covers payments, receipts, balance invoices, backup validation, account isolation and concurrent saves. Security tests cover encryption roundtrips, tampering, password errors, parameter validation and an independent Node AES-GCM decryption. Browser tests exercise encrypted downloads, unlocking, non-destructive file checks and session lock during encryption.
Cloud-recovery tests cover missing/deleted workspaces, duplicate rows, invalid save versions, recovery-storage failure, corrupt local metadata, delayed reads, edits during reload, session changes, normal reconnects and first-time initialization.
The workflow suite additionally covers guest switching, truthful message statuses, payment reconciliation, posting buttons, expense/budget reconciliation, historical cost links, restore previews, cancelled/failed restores, retained attachments and privacy on session lock. Layout checks cover the existing screens and new workspaces at 1440, 1080 and 390 pixels.

Set AUDIT_OUTPUT to choose a screenshot/PDF output directory. PLAYWRIGHT_PATH can point to an existing Playwright installation. Generated PDFs use fictional guest details.

## Server Requirements

`npm run check:public-access` runs explicit read-only probes against the configured Supabase project using only its publishable key. It selects at most one opaque ID from each of the three known app tables, never guest details. It distinguishes permission denial from empty results, incorrect keys or outages; no row IDs or credentials are printed. This network check is separate from the offline test suite and cannot verify signed-in account isolation or write permissions.


Client checks are not database authorization. Supabase must enforce owner-only row-level security, including insert/update ownership checks. The snapshot table also needs a unique key on (user_id, data_type, record_key). Administrative RLS, storage, edge functions, account restrictions and independent server backups must be reviewed in Supabase; the static-site repository cannot establish their live configuration. Server backups and an independent copy require separate verification, including a restore drill on a disposable target. Supabase database backups do not include Storage API object contents; those must be covered separately if used. See the [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups) and [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security).
