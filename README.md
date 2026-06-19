# Sunrise Villa Booking Website

This is a static website for managing Sunrise Villa bookings.

## Files

- `index.html` - the website page
- `styles.css` - layout and visual styling
- `app.js` - booking logic, dashboard, calendar, import/export, and quick-view image generation

## Open Locally

Run a simple web server from this folder, then open the local URL in your browser.

```bash
python3 -m http.server 4173
```

Local URL:

```text
http://localhost:4173/
```

## Put It Online

This can be uploaded as a static site to Netlify, Vercel, GitHub Pages, Cloudflare Pages, or any normal web hosting service.

For the quickest route, upload these three files together:

- `index.html`
- `styles.css`
- `app.js`

The current version stores bookings in the browser on each device. For shared access across multiple phones/computers, connect it later to an online database such as Supabase, Firebase, Airtable, or Google Sheets.

Use `Google Sheets CSV` in the app to download a file that can be imported directly into Google Sheets.
