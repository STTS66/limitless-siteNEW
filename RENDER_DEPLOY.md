# Render Deploy

## What gets deployed

- `limitless-web`: static frontend with custom domain `limitless.pp.ua`
- `limitless-api`: Rust API for token validation, admin login, and prompt storage
- `limitless-telegram-api`: Telegram bot + payment/token API with a persistent disk for `auth.db`
- `limitless-support-bot`: Telegram support bot with a persistent disk for `support.db`

## Before creating services

1. Push the current repo state to GitHub.
2. In Render, create a new Blueprint from this repo.
3. During Blueprint setup, provide secret values for:
   - `ADMIN_PASSWORD`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_ADMIN_IDS`
   - `SUPPORT_BOT_TOKEN`
   - `SUPPORT_BOT_OWNER_ID`

## Custom domain

The frontend service already declares `limitless.pp.ua` in `render.yaml`.

After Render creates `limitless-web`:

1. Open the service in Render.
2. Go to `Settings` -> `Custom Domains`.
3. Confirm `limitless.pp.ua`.
4. Add the DNS record exactly as Render shows in the dashboard for your DNS provider.
5. Verify the domain in Render.

Render automatically provisions TLS after the domain verifies.

## Notes

- The frontend uses `VITE_API_BASE_URL=https://limitless-api.onrender.com`.
- If you later attach a custom domain to the API, update `VITE_API_BASE_URL` in Render and redeploy `limitless-web`.
- Prompt edits from the admin page are stored in `rust-backend/data/prompt-config.json` locally, and in Render they live on the `prompt-config-disk` persistent disk.
- `limitless-telegram-api` and `limitless-support-bot` are standard Render web services with `/health`, so after deploy you can ping them with UptimeRobot if you want to reduce cold starts on the free plan.
