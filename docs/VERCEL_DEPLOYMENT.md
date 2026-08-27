# Vercel Deployment Checklist

## Landing (`apps/landing`)

Set in Vercel project environment variables:

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_API_URL` | Yes | Public URL of deployed API (not `localhost`) |
| `NEXT_PUBLIC_WC_PROJECT_ID` | Yes | WalletConnect project ID |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Yes for email login | Public Privy App ID |

## API (`apps/api`)

Deploy API separately (Vercel serverless, Railway, Fly.io, etc.). SQLite (`file:`) **does not work** on Vercel serverless — use **Postgres** (`DATABASE_URL`) for production.

| Variable | Required |
|----------|----------|
| `DATABASE_URL` | Yes (Postgres in production) |
| `DIRECT_URL` | Yes for Prisma migrations |
| `SESSION_SECRET` | Yes |
| `WALLET_ENCRYPTION_KEY` | Yes |
| `AI_MEMORY_KEY` | Recommended; use a planned rotation for existing encrypted messages |
| `CORS_ORIGIN` | Yes — your Vercel landing URL |
| `ARC_TESTNET_RPC_URL` | Yes |
| `BUNDLER_RPC_URL` | Yes |
| `CIRCLE_API_KEY` | Yes |
| `CIRCLE_ENTITY_SECRET` | Yes |
| `CIRCLE_WALLET_SET_ID` | Yes |
| `PRIVY_APP_ID` | Yes for email login |
| `PRIVY_APP_SECRET` | Yes for email login; server-only |
| `PRIVY_JWT_VERIFICATION_KEY` | Optional; avoids a JWKS lookup when verifying tokens |
| `XAI_API_KEY` | Optional; enables the server-side Damian conversation model |
| `XAI_MODEL` | Optional; defaults to `grok-4.3` |

## Active users (presence)

In-memory presence works on a **single API instance**. For accurate counts on Vercel serverless (multiple instances), add **Redis/Upstash** — not yet wired.

## Security

- Never commit `.env` files (gitignored).
- Rotate keys if exposed in chat logs.
- Add all secrets via Vercel Environment Variables UI.
