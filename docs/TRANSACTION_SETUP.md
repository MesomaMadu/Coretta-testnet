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
| USDC fee configuration | ✓ Configured | Circle Paymaster v0.7 on Arc Testnet |
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
| `PRIVY_APP_ID` / `PRIVY_APP_SECRET` | ⚠ Required for email OTP |
| `NEXT_PUBLIC_PRIVY_APP_ID` | ⚠ Required in the landing app for email OTP |
| `NEXT_PUBLIC_WC_PROJECT_ID` | ✓ Set in landing `.env.local` |

## Client Transaction Flow

1. User confirms a transaction preview in the agent
2. Wallet signs an authorization containing the exact Arc chain ID, recipient/amount (or swap pair/amount), nonce/idempotency key, and issue time
3. API verifies the signer belongs to the session and that the signed intent matches the request body
4. API creates and executes the operation through the user's Circle smart wallet
5. Transaction hash is returned when available
6. Client polls transfer state until `SETTLED` or `FAILED`
7. Activity tab and in-chat status cards update from shared `transaction-store`

## Swap (USDC ↔ EURC)

The agent previews and submits Arc Testnet swaps through `POST /v1/swap` and Circle App Kit. A Circle Kit Key, Circle-managed wallet, token balance, and an available Arc Testnet liquidity route are still required for a successful end-to-end swap.

| Piece | Status |
|-------|--------|
| Intent parser + locked preview UI | ✓ Present |
| `POST /v1/swap` | ✓ Present; signed-intent authorization required |
| Circle App Kit / wallets adapter | ✓ Wired server-side |
| Allowed Arc Testnet pair | ✓ USDC ↔ EURC |
| Live liquidity / funded wallet | ⚠ Manual E2E prerequisite |
| Usage counter `swapRequestCount` | ✓ Server-side execution path |

### Manual inputs required before swaps can execute

1. `KIT_KEY`, Circle API credentials, and the matching Wallet Set
2. A funded Circle smart wallet with the source token
3. An available App Kit route/liquidity for the USDC/EURC amount
4. A dedicated Arc RPC/bundler for production reliability

### What works today without swap

- Wallet connect + ownership signature (no email required)
- Smart wallet bound to connected EOA
- **USDC send** via `POST /v1/remit` to a full `0x` address (or email when email auth works)

## Email authentication flow

See [`EMAIL_SETUP.md`](./EMAIL_SETUP.md). Privy sends and verifies the email code; `POST /v1/auth/privy` verifies the Privy access token and exchanges it for a Coretta session.

---

Values not listed as **Configured** require **MANUAL CONFIGURATION REQUIRED** before production deployment.
