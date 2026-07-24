# Transaction Processing Setup Report

Dependencies required for real-time transaction processing in Coretta.

## Wallet Infrastructure

| Dependency | Status | Notes |
|------------|--------|-------|
| RPC Endpoint | ✓ Configured | `ARC_TESTNET_RPC_URL` or default Arc Testnet RPC |
| Chain ID | ✓ Configured | `5042002` |

## Circle

| Dependency | Status | Notes |
|------------|--------|-------|
| API Key | ⚠ Manual Input Required | `CIRCLE_API_KEY` |
| Entity Secret | ⚠ Manual Input Required | `CIRCLE_ENTITY_SECRET` |
| Wallet Set ID | ⚠ Manual Input Required | `CIRCLE_WALLET_SET_ID` |
| Smart wallet provisioning | ✓ Configured | Via `apps/api` wallet service |

## Paymaster

| Dependency | Status | Notes |
|------------|--------|-------|
| Sponsorship configuration | ✓ Configured | Circle Paymaster v0.7 on Arc Testnet |
| USDC permit signing | ✓ Configured | `packages/chain/src/paymaster.ts` |

## Bundler

| Dependency | Status | Notes |
|------------|--------|-------|
| Bundler endpoint | ⚠ Manual Input Required | Set `BUNDLER_RPC_URL` for production Pimlico key |
| ERC-4337 UserOp submission | ✓ Configured | `packages/chain/src/bundler.ts` |

## Indexer / Activity

| Dependency | Status | Notes |
|------------|--------|-------|
| Activity indexing source | ✓ Configured | Prisma `Transfer` table + `GET /v1/transfers` |
| Real-time client updates | ✓ Configured | Poll `/v1/transfers/:id` + `transaction-store` events |

## Environment Variables

### Required

| Variable | Status |
|----------|--------|
| `DATABASE_URL` | ✓ Example provided |
| `SESSION_SECRET` | ⚠ Manual Input Required (production) |
| `WALLET_ENCRYPTION_KEY` | ⚠ Manual Input Required (production) |
| `NEXT_PUBLIC_API_URL` | ✓ Default localhost:3001 |

### Optional

| Variable | Status |
|----------|--------|
| `BUNDLER_RPC_URL` | ⚠ Manual Input Required (recommended production) |
| `DEV_MODE` | ✓ Optional dev flag |
| `EMAIL_PROVIDER_API_KEY` | ⚠ Manual Input Required (email OTP) |
| `EMAIL_FROM_ADDRESS` | ⚠ Manual Input Required (email OTP) |
| `NEXT_PUBLIC_WC_PROJECT_ID` | ✓ Set in landing `.env.local` |

## Client Transaction Flow

1. User confirms preview in Damian
2. Wallet signs ownership authorization message (mandatory, even when sponsored)
3. API creates and executes remittance via smart wallet + bundler + paymaster
4. Transaction hash returned immediately when available
5. Client polls transfer state until `SETTLED` or `FAILED`
6. Activity tab and in-chat status cards update from shared `transaction-store`

## Swap (USDC ↔ EURC) — NOT IMPLEMENTED ON-CHAIN

The agent can **preview** swap intents (`swapUSDCtoEURC` / `swapEURCtoUSDC`) but **cannot settle** them.

| Piece | Status |
|-------|--------|
| Intent parser + locked preview UI | ✓ Present (preview only) |
| `POST /v1/swap` (or equivalent) | ✗ Missing |
| DEX / router / pool on Arc Testnet | ✗ Not integrated |
| EURC liquidity route config | ✗ Not configured |
| Circle Swap Kit wiring | ✗ Not integrated |
| Usage counter `swapRequestCount` | ✓ Tracks client events only |

### Manual inputs required before swaps can execute

1. **Swap router / pool address** on Arc Testnet (or Circle Swap Kit product + credentials)
2. **EURC token address** confirmation on Arc Testnet (app has a default in `apps/landing/src/lib/chains.ts` — verify against Circle docs)
3. **Route path** (USDC→EURC pool, fee tier, min-out / slippage policy)
4. **Funded smart wallet** with source token balance
5. **RPC**: public `https://rpc.testnet.arc.network` hits rate limits — use a dedicated/key-backed RPC if available
6. **`BUNDLER_RPC_URL`**: Pimlico (or other) bundler URL with API key for sponsored UserOps
7. Backend builder: encode swap calldata + (optional) paymaster sponsorship into one UserOp

### What works today without swap

- Wallet connect + ownership signature (no email required)
- Smart wallet bound to connected EOA
- **USDC send** via `POST /v1/remit` to a full `0x` address (or email when email auth works)

## Email Authentication Flow

1. `POST /v1/auth/otp/send` — delivers 6-digit code (Resend when configured)
2. `POST /v1/auth/otp/verify` — validates code, issues session token
3. OTP: 5-minute expiry, 5 max attempts, 30s resend cooldown

---

Values not listed as **Configured** require **MANUAL CONFIGURATION REQUIRED** before production deployment.
