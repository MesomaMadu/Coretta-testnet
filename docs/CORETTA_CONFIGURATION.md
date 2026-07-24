# Coretta Configuration Report

Generated for developer setup. Values marked **Configured** were detected in the repository or environment examples. Values marked **Manual Input Required** must be supplied before production use.

## Email OTP

| Item | Status |
|------|--------|
| `EMAIL_PROVIDER_API_KEY` (Resend) | ⚠ Manual Input Required |
| `EMAIL_FROM_ADDRESS` | ⚠ Manual Input Required |
| Domain verification (Resend dashboard) | ⚠ Manual Input Required |
| `DEV_MODE=true` (logs OTP to API console) | ✓ Available for local dev |

## Wallet Infrastructure

| Item | Status |
|------|--------|
| Arc Testnet RPC (`ARC_TESTNET_RPC_URL`) | ✓ Default: `https://rpc.testnet.arc.network` |
| Chain ID | ✓ `5042002` (Arc Testnet) |
| `NEXT_PUBLIC_WC_PROJECT_ID` | ✓ Present in `apps/landing/.env.local` |

## Circle

| Item | Status |
|------|--------|
| `CIRCLE_API_KEY` | ⚠ Manual Input Required |
| `CIRCLE_ENTITY_SECRET` | ⚠ Manual Input Required |
| `CIRCLE_WALLET_SET_ID` | ⚠ Manual Input Required |
| Paymaster v0.7 address (Arc Testnet) | ✓ `0x31BE08D380A21fc740883c0BC434FcFc88740b58` |
| USDC token (Arc Testnet) | ✓ `0x3600000000000000000000000000000000000000` |

## Paymaster & Bundler

| Item | Status |
|------|--------|
| Circle Paymaster integration (`packages/chain`) | ✓ Implemented |
| `BUNDLER_RPC_URL` (Pimlico) | ⚠ Manual Input Required for production |
| Public Pimlico endpoint (dev fallback) | ✓ Used when `BUNDLER_RPC_URL` unset |

## API & Session

| Item | Status |
|------|--------|
| `DATABASE_URL` | ✓ Example in `.env.example` |
| `SESSION_SECRET` | ⚠ Manual Input Required (production) |
| `WALLET_ENCRYPTION_KEY` | ⚠ Manual Input Required (production) |
| `NEXT_PUBLIC_API_URL` | ✓ Default: `http://localhost:3001` |
| `CORS_ORIGIN` | ⚠ Set to match landing origin |

## Indexer / Activity

| Item | Status |
|------|--------|
| Transfer polling (`GET /v1/transfers/:id`) | ✓ Implemented |
| Arcscan explorer base URL | ✓ `https://testnet.arcscan.app` |
| External indexer webhook | ⚠ Not configured |

---

**Do not commit real API keys or secrets.** Use `.env` locally and your deployment provider's secret store in production.
