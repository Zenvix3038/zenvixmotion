# Zenvix Motion Website

Premium film production company website with:

- public portfolio and production service pages
- admin work upload panel
- visitor tracking
- lead capture
- live chat inbox
- Achachan AI assistant
- asset store with watermarked previews
- demo payment unlock for original downloads
- optional Google Sheets webhook

## Run

```bash
npm start
```

Open:

- Website: `http://localhost:4173`
- Admin: `http://localhost:4173/admin.html`

Default admin password is `admin123`.

## Production setup

Set these environment variables before running:

```bash
ADMIN_PASSWORD="change-this"
GOOGLE_SHEET_WEBHOOK="your-google-apps-script-web-app-url"
OPENAI_API_KEY="optional-openai-key-for-real-ai"
OPENAI_MODEL="gpt-4.1-mini"
PORT=4173
```

If `OPENAI_API_KEY` is not set, the AI assistant still works with a production-focused fallback reply system.

Google Sheets setup is documented in `docs/google-sheets-app-script.md`.

## Store notes

Store originals are saved in `store-assets/`, not public uploads. Visitors can download a watermarked preview before payment. Original download requires a purchase token from the checkout flow.

Browser screenshots cannot be fully blocked by any website, but the store adds preview watermarking, right-click/drag blocking, shortcut blocking, and protected original download links.
