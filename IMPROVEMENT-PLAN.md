# Sunrise Villa — UI/UX + Automation Improvement Plan
*Research-backed architecture. Prepared 2026-06-20. Plan-first: nothing is built until approved.*

## 1. Where you are today
- **Frontend:** one static vanilla-JS app (`index.html` + `app.js` + `styles.css`) on GitHub Pages. No build step.
- **Data:** Supabase, but **everything is stored as one JSON blob** (`app_data` row). Bookings, documents, tax, settings all live inside it.
- **Messaging:** already half-right — the app builds a templated message and opens a `wa.me` link; you tap Send. `whatsappSent` is a manual checkbox.
- **Documents:** Quotation / Invoice / Receipt render as printable HTML (print-to-PDF), archived in the blob.

**The core constraint:** automation (triggers + scheduled reminders) works on database *rows*, not on a JSON blob. And bookings currently have **no `status`, no `guest_email`, no `villa`** field, and `arrival` is a string. These must be fixed first — it's foundational, not cosmetic.

## 2. Top UI/UX improvements (prioritized by impact / effort)
| Impact/Effort | Area | Change |
|---|---|---|
| High / Med | **"Today" home view** | Replace the metrics-heavy dashboard landing with an ops cockpit: Arrivals today · Departures today · In-house now · Actions due (messages queued/failed, balances unpaid, docs to send). 5–9 cards, color only for overdue. *(Smoobu/Beds24 pattern; NN/g density rules.)* |
| High / High | **Automation / Rules screen (missing)** | A dedicated screen split into **Event rules** (fire on booking event) vs **Scheduled rules** (offset from check-in), each with a per-rule toggle: *auto-send* vs *prepare for 1-tap*. Ship pre-seeded editable defaults. *This screen IS your semi-auto/full-auto requirement made visible. (Hospitable pattern.)* |
| High / High | **Messages → unified inbox** | Each thread shows the matching booking (dates/villa/amount/balance) in a side panel, 1-click template insertion, per-thread notes, WhatsApp + Email in one thread. *(Hostaway pattern.)* |
| High / Med | **Documents → send-enabled** | A **Send** action on each Quotation/Invoice/Receipt with a channel picker (WhatsApp and/or Email). Guest guide becomes one reusable guidebook, not text pasted per template. |
| High / Med | **Booking status pipeline + villa/email fields** | Explicit status (inquiry → quoted → confirmed → in-house → checked-out), `guest_email`, `villa`; status shown as colored booking blocks. **Automation is impossible without these.** |
| High / Med | **Activity log + per-message status** | One chronological log (sent/queued/failed, doc generated, status change, payment) + a queued/sent/failed badge per send. **Build before enabling full-auto** so a silent failure (guest never gets door code) is visible. |
| Med / Med | **Guest/CRM record** | Guest record (name, phone E.164, email, past stays, notes) reachable from any booking. *(Wants its own table.)* |
| Med / Med | **Multi-villa calendar + turnover flag** | One calendar, both villas as rows, blocks colored by status, auto "cleaning needed" cue on checkout dates. |
| Med / Med | **Per-villa financial statement** | Monthly/annual statement (revenue by Direct vs Airbnb, expenses by category, net) → PDF, feeding the Tax module. |
| Med / Low | **Send-time clamping** | Clamp all automated sends to 08:00–21:00 MYT (cron is UTC; `0 1 * * *` = 9am MYT). No 3am "good morning". |

## 3. Automation architecture (end-to-end)
**Pluggable messaging — one switch.** `appSettings.message.mode` = `'semi'` | `'auto'` (default `semi`). Every send routes through one decision point:
- **SEMI (free):** keep the existing `wa.me` flow; you tap Send. Documents go as text containing a public download link (wa.me can't attach files or truly auto-send).
- **AUTO (~MYR 2/mo):** the *same trigger* instead calls a Supabase **Edge Function** that POSTs to Meta's WhatsApp Cloud API. Token lives in Edge Function secrets — **never** in the public `app.js`.

**Booking-confirmed trigger:** a Database Webhook on `bookings` UPDATE → `send-whatsapp` Edge Function, which acts only when `status` flips to `confirmed`, then sends (1) check-in details + (2) guest guide, stamps `checkin_sent_at`, logs it. In semi mode it instead queues a 1-tap action on the Today card.

**1-week reminder:** `pg_cron` daily at `0 1 * * *` UTC (9am MYT) → `send-reminders`, which does `SELECT … WHERE status='confirmed' AND arrival_date = current_date + 7 AND reminder_sent_at IS NULL`, sends, stamps `reminder_sent_at`. One daily date-match sweep (never one cron row per booking); `*_sent_at` flags prevent double-sends and let the next day retry failures.

**One-click documents:** click Send → `html2pdf.js` renders the existing HTML to a PDF → upload once to **Supabase Storage** → one URL feeds **both** Email (Resend attachment) and WhatsApp (document-message link). The channel toggle just picks the branch.

## 4. Message timeline (pre-seed; you toggle each on/off)
| Trigger | Offset | Channel | Content |
|---|---|---|---|
| Booking → **CONFIRMED** | immediate | WhatsApp (utility) | Confirmation + full check-in details (address, time, access, WiFi, parking, guidebook link) |
| Booking → **CONFIRMED** | immediate | WhatsApp (utility) | Guest guide / digital guidebook link |
| **7 days before arrival** *(your required reminder)* | ~9am MYT | WhatsApp (utility) | Re-send check-in details + guidebook + directions, confirm arrival |
| *(optional)* 3 days before | ~10am | WhatsApp | Pre-check-in recap (code/parking/WiFi) |
| *(optional)* morning of arrival | ~10am | WhatsApp | "Villa is ready, here to help" |
| *(optional)* mid-stay (≥3 nights only) | mid-stay AM | WhatsApp | "Settled in OK?" |
| *(optional)* evening before checkout | — | WhatsApp | Checkout time + lock-up tasks |
| *(optional)* ~2 days after checkout | — | WhatsApp | Thank-you + gentle review request |
| **Document Send** (Quotation/Invoice/Receipt) | on demand | WhatsApp and/or Email | PDF via Storage URL; default **both** for Invoice/Receipt |

## 5. Data model evolution (non-breaking)
1. **Add fields in the blob first** (additive, existing code ignores unknown keys): `status`, `villa`, `guest_email`, `guest_phone_e164`. Legacy bookings default `status='confirmed'` so they don't re-trigger.
2. **Create `public.bookings`** (id, source, villa, guest_name, guest_phone_e164, guest_email, arrival_date, nights, status, amount_myr, checkin_sent_at, reminder_sent_at, created_at). Back-fill once via `jsonb_to_recordset(data->'bookings')`.
3. **Dual-write** during transition: app save → `upsert-booking` Edge Function. Frontend keeps reading the blob short-term. **`public.bookings` is the single source of truth for automation.**
4. Keep PDFs in **Storage** (store only the URL, never base64 in the blob).
5. Add `public.activity_log` and later `public.guests` (real tables, not blob keys).
6. **E-invoice future-proofing:** store invoice line items as structured data + optional buyer TIN fields, so a MyInvois export is trivial if you ever cross RM1m. *No live API now.*

> This honors the **FROZEN data-layer rule** in DATA-CONTRACT.md: the blob remains the frontend's read source until the relational table is proven, then cut over table-by-table.

## 6. Tech stack
- **Frontend:** unchanged static app on GitHub Pages + one `<script>`: `html2pdf.js`.
- **Backend:** Supabase — `public.bookings` (+ `activity_log`, later `guests`); Edge Functions (`send-whatsapp`, `send-document`, `send-reminders`, `upsert-booking`); Database Webhook on `bookings` UPDATE; `pg_cron` + `pg_net`; Vault; Storage for PDFs. Secrets (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `RESEND_API_KEY`) only in Edge Function secrets.
- **WhatsApp:** Meta Cloud API **direct** (no BSP). Needs Meta Business account + WhatsApp Business Account + a **dedicated phone number** (not on consumer WhatsApp) + business verification + 2–3 approved **UTILITY** templates.
- **Email:** **Resend** (free 3,000/mo). Must verify a sending domain (SPF+DKIM) — don't send from a gmail.com "from".
- **PDF:** `html2pdf.js` client-side (reuses existing HTML).

## 7. Costs (realistic)
| Item | Cost |
|---|---|
| Semi-auto WhatsApp (wa.me) | **MYR 0**, forever |
| Full-auto WhatsApp (Cloud API direct) | **~MYR 1.30–2.00/month** at 20–30 utility msgs; free if guest messaged within 24h |
| Email (Resend) | **MYR 0** (free 3,000/mo) |
| PDF generation + hosting (Storage) | **MYR 0** (free tier) |
| Supabase **Free** | MYR 0 — **but pauses after 7 days idle → kills reminders** |
| Supabase **Pro** (recommended for live guests) | **~MYR 120/month** (USD $25; no pausing) |
| Sending domain (if not owned) | ~USD 10–15/yr |
| BSPs (Wati/360dialog/Twilio) | **Skip** — fees dwarf the ~MYR 2 actual cost |

**All-in: free path ≈ MYR 0; reliable production path ≈ MYR 120/mo (essentially just Supabase Pro) + ~MYR 2 WhatsApp.**

## 8. Malaysia e-Invoicing (LHDN MyInvois)
You are **almost certainly exempt** today (combined turnover < **RM1,000,000**; the old RM150k figure is outdated; Phase 5 cancelled). Action: keep documents labelled "Invoice"/"Receipt" (not "e-Invoice"), don't build API submission, but store structured line items + optional buyer-TIN so a free MyInvois Portal bulk-upload is trivial if you ever cross RM1m. ⚠️ Exemption isn't automatic if the villas sit under a group exceeding RM1m — confirm the owning entity.

## 9. Phased roadmap
- **Phase 0 — Data foundation:** add status/villa/email/phone to blob (non-breaking); create `public.bookings`, back-fill, dual-write. *→ a queryable source of truth; nothing user-visible breaks.*
- **Phase 1 — UI/UX quick wins (no backend):** Today view; status pipeline + colored blocks; Documents "Send" plumbing; single guidebook; send-time clamp. *→ daily-usability lift + scaffolding automation hooks into.*
- **Phase 2 — Semi-auto engine (free):** Rules screen (Event vs Scheduled) with auto/1-tap toggles + pre-seeded defaults; daily `pg_cron` sweep queues 1-tap reminders into Today; activity log + per-send status. *→ full cadence works end-to-end for FREE.*
- **Phase 3 — Documents via Storage (free):** html2pdf.js + Storage + `send-document` (Resend email + WhatsApp link) with channel toggle. *→ one-click docs, two channels, ~MYR 0.*
- **Phase 4 — Full-auto WhatsApp (~MYR 2/mo + one-time setup):** Meta account, dedicated number, verification, submit utility templates; Cloud API branch + mode switch + Webhook (status-flip guard) + graceful fallback to semi; upgrade Supabase to Pro before relying on it. *→ true hands-off behind one switch, with the activity log proving each send.*
- **Phase 5 — CRM, statements, e-invoice readiness:** `public.guests` + history; per-villa statements → PDF feeding Tax; structured invoice items + buyer-TIN + MyInvois bulk export (no live API).

## 10. Skills / agents to use to build it
- **Build/verify loop:** the `run` + `verify` skills and the Claude Preview MCP (start/screenshot/eval) — every UI phase eyeballed before sign-off (matches your prompt→code→preview workflow).
- **Quality gates per phase:** `code-review` (bugs) + `simplify` (reuse/altitude); **`security-review` on the Edge Functions** — the #1 risk is a token landing in the public `app.js`.
- **Ops health:** a `schedule`/`loop` cloud agent as a daily keep-alive ping + failed-send alert (surfaces a silent reminder failure fast; doubles as the Free-tier keep-alive).
- **New project skill worth creating:** a `sunrise-villa` build skill codifying (a) the blob↔relational dual-write + frozen-data-layer rule, (b) the secrets-never-in-app.js guard, (c) the Edge-Function + Webhook + pg_cron scaffolding — so future sessions don't re-derive the migration or break the data layer. Plus a small "whatsapp-template-submit" checklist (UTILITY-not-Marketing wording, dedicated-number/verification prerequisites).

## 11. Open decisions (need your input before Phase 0/4)
1. **Reliability:** Supabase Free + daily keep-alive (free, slightly risky) vs **Pro ~MYR 120/mo** (recommended once real guests depend on reminders). Pick when going live, not for prototyping.
2. **Dedicated WhatsApp number** for full-auto (not your personal WhatsApp) + budget for business verification (can take days). Worth it vs staying semi-auto?
3. **Sending domain** for email (Resend SPF/DKIM) — do you own one? (~USD 10–15/yr if not.)
4. **Optional cadence messages** to enable beyond your two required ones (-3d, day-of, mid-stay, pre-checkout, post-stay review).
5. **2-villa data:** are Windmill Villa bookings in this same app today, or tracked separately? (Affects the back-fill + per-villa views.)
6. **e-invoice:** confirm the owning entity isn't part of a group over RM1m.

## 12. Sources (key)
- Meta WhatsApp pricing & categories — https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Malaysia per-message rates (2026) — https://flowcall.co/blog/whatsapp-business-api-pricing-2026
- WhatsApp document/media messages — https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/document-messages/
- wa.me click-to-chat limits — https://faq.whatsapp.com/5913398998672934
- Supabase pricing / free-tier pause — https://supabase.com/pricing
- LHDN MyInvois FAQ — https://sdk.myinvois.hasil.gov.my/faq/
- Malaysia e-invoice penalties/thresholds — https://www.cleartax.com/my/en/e-invoicing-malaysia
- Resend pricing — https://resend.com/pricing
- BSP cost comparison — https://ezcontact.ai/en/blog/whatsapp-api-pricing-comparison-meta-twilio-360dialog-ezcontact/
*(Rates verified mid-2026 from cited sources; confirm the live Malaysia MYR WhatsApp rate in Meta's rate selector before relying on exact figures.)*
