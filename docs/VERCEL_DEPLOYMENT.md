# Vercel Deployment Checklist

## Landing (`apps/landing`)

Set in Vercel project environment variables:

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_API_URL` | Yes | Public URL of deployed API (not `localhost`) |
| `NEXT_PUBLIC_WC_PROJECT_ID` | Yes | WalletConnect project ID |

## API (`apps/api`)

Deploy API separately (Vercel serverless, Railway, Fly.io, etc.). SQLite (`file:`) **does not work** on Vercel serverless — use **Postgres** (`DATABASE_URL`) for production.

| Variable | Required |
|----------|----------|
| `DATABASE_URL` | Yes (Postgres in production) |
| `SESSION_SECRET` | Yes |
| `WALLET_ENCRYPTION_KEY` | Yes |
| `CORS_ORIGIN` | Yes — your Vercel landing URL |
| `ARC_TESTNET_RPC_URL` | Yes |
| `BUNDLER_RPC_URL` | Yes |
| `CIRCLE_API_KEY` | Yes |
| `CIRCLE_ENTITY_SECRET` | Yes |
| `CIRCLE_WALLET_SET_ID` | Yes |
| `EMAIL_PROVIDER_API_KEY` | For email OTP |
| `EMAIL_FROM_ADDRESS` | For email OTP |

## Active users (presence)

In-memory presence works on a **single API instance**. For accurate counts on Vercel serverless (multiple instances), add **Redis/Upstash** — not yet wired.

## Security

- Never commit `.env` files (gitignored).
- Rotate keys if exposed in chat logs.
- Add all secrets via Vercel Environment Variables UI.
