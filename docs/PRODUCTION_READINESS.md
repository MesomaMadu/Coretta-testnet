# Production readiness report

Generated from codebase inspection and automated changes. Items marked verified were checked in-repo or via successful builds.

## 1. Automatically fixed

- Fixed landing production build failure caused by remote Google Fonts (Noto SC/JP/Devanagari) — Latin fonts only + system CJK fallbacks.
- Added root `.npmrc` with `legacy-peer-deps=true` for Circle/Solana peer conflicts.
- Added Privy email OTP with `@privy-io/react-auth` and server-side access-token verification through `@privy-io/node`.
- Wallet auth remains available through `POST /v1/auth/wallet`; ownership and transaction signatures now enforce Arc Testnet chain ID `5042002`.
- Remit and swap requests require a fresh wallet signature over the exact transaction intent; swap nonces are replay-protected in the current API process.
- Removed API-startup mass SCA deployment and the authenticated `deploy-all` endpoint; deployment is now explicit and user-scoped.
- Added production-oriented `config` aliases: `JWT_SECRET` → session, `RPC_URL` → Arc RPC, multi-origin `CORS_ORIGIN`.
- Structured logging for API errors, remit, swap, paymaster, RPC (secrets redacted).
- Added `POST /v1/swap` using Circle **App Kit** + Circle wallets adapter; the Arc Testnet API currently permits only **USDC↔EURC**.
- Frontend Confirm path calls `/v1/swap` for swap actions; intent parser rejects USDC/native swaps.
- Remit errors log paymaster/RPC classification; Arc public client uses configured RPC.
- Updated `.env.example` for production variables (no secrets).
- Prisma schema documents Postgres switch for production.
- Root `npm run lint` runs TypeScript package builds (workspace typecheck).
- Upgraded the landing app to Next.js 16 / React 19.2 and pinned safe same-major transitive versions for Axios, form-data, Hono, nanoid, and ws.

## 2. Manual configuration required

### Hosting

- Deploy **API** (`apps/api`) to Railway / Fly.io / Render (long-running Node, not pure serverless SQLite).
- Deploy **landing** (`apps/landing`) to Vercel (or similar).

### Database

- Create **PostgreSQL** instance.
- In `packages/db/prisma/schema.prisma`, set `provider = "postgresql"`.
- Set `DATABASE_URL` to the Postgres URL.
- Run:

```bash
npm run db:generate
npm run db:push
```

(No Prisma migration history in repo yet — `db push` is the current project path. Prefer `prisma migrate deploy` only after you introduce formal migrations.)

### Environment variables

**Backend (`apps/api` host):**

| Variable | Required |
|----------|----------|
| `DATABASE_URL` | Yes (Postgres in prod) |
| `SESSION_SECRET` or `JWT_SECRET` | Yes |
| `WALLET_ENCRYPTION_KEY` | Yes |
| `CORS_ORIGIN` | Yes (landing origin(s), comma-separated) |
| `ARC_TESTNET_RPC_URL` or `RPC_URL` | Yes (prefer dedicated RPC) |
| `BUNDLER_RPC_URL` | Yes |
| `CIRCLE_API_KEY` | Yes |
| `CIRCLE_ENTITY_SECRET` | Yes |
| `CIRCLE_WALLET_SET_ID` | Yes |
| `KIT_KEY` | Yes for swaps |
| `PRIVY_APP_ID` | Yes for email login |
| `PRIVY_APP_SECRET` | Yes for email login; server-only |
| `PRIVY_JWT_VERIFICATION_KEY` | Optional |
| `DEV_MODE` | Set `false` in production |
| `PORT` | Optional (default 3001) |

**Frontend (Vercel):**

| Variable | Required |
|----------|----------|
| `NEXT_PUBLIC_API_URL` | Yes (public API HTTPS URL) |
| `NEXT_PUBLIC_WC_PROJECT_ID` | Yes |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Yes for email login; public App ID |

Do **not** put Circle/Kit/session secrets in `NEXT_PUBLIC_*`.

### Domain / CORS / WalletConnect

- Point production domain at the frontend.
- Set `CORS_ORIGIN` to that exact origin (and www variant if needed).
- Set `NEXT_PUBLIC_API_URL` to the public API base URL.
- Add the production domain in WalletConnect Cloud and Privy's allowed domains.

### Circle / Arc

- Confirm keys match **testnet** vs future mainnet.
- Prefer a **dedicated Arc RPC** (public RPC rate-limits).
- Fund SCAs / Circle wallets with USDC (and EURC for swaps).
- **Swap caveat (manual / ops):** App Kit Circle-wallets adapter expects wallets managed via Circle developer-controlled wallets. Locally generated Safe SCAs may **not** be eligible for kit swaps until provisioned under your Wallet Set.

### Pre-deploy commands

```bash
npm install
npm run build -w @coretta/shared
npm run build -w @coretta/chain
npm run build -w @coretta/db
npm run build -w @coretta/api
npm run build --prefix apps/landing
npm run lint
npm run db:generate
# after Postgres URL + provider=postgresql:
npm run db:push
```

### Security

- Rotate any secrets previously pasted in chat.
- Confirm `.env` / recovery files are not in git.

## 3. Verification checklist

| Item | Status |
|------|--------|
| Project packages typecheck (shared/chain/db/api) | **Code-ready** — re-run build after pull |
| Landing builds without Google Fonts network | **Fixed in code** — verify with `npm run build --prefix apps/landing` |
| Dependency peer conflicts mitigated | **`.npmrc` legacy-peer-deps** — verify `npm install` |
| Wallet connection (injected + WC) | **Code present** — **manual E2E** on MetaMask/Rabby/OKX/WC |
| Ownership signing | **Code present** — **manual E2E** |
| Smart wallet activation | **Code present** — **manual E2E** |
| Remittance `/v1/remit` | **Code present + logging** — **manual E2E** with funded wallet |
| Swap `/v1/swap` | **Endpoint added** — **manual E2E**; may need Circle-managed wallet |
| USDC gas payment (paymaster) | **Code path in chain package** — **manual E2E** |
| Tx hash / explorer URL returned | **Code present** for remit; swap when kit returns hash |
| No localhost hard requirement | **Uses env** — defaults still localhost for local dev |
| Production env configured on hosts | **Manual** |
| PostgreSQL configured | **Manual** (schema still sqlite until you switch) |
| Backend/frontend deployed | **Manual** |
| Privy email auth | **Code-ready** — requires dashboard credentials and manual email E2E |
| Ready for production | **No** — hosting, Postgres, E2E, and key rotation remain |

## 4. Blocked / incomplete without more information

- Full **mainnet** cutover (chain IDs, production Circle keys, compliance).
- Formal **Prisma migrations** history (only `db push` today).
- Guarantee that **local SCAs** work with **App Kit swaps** (depends on Circle wallet inventory).
- Dedicated **lint ESLint config** for landing (lint script is TypeScript package builds).
- Redis-backed **presence** for multi-instance active-user counts.
- Distributed replay storage (Redis/DB) for swap authorization nonces on multi-instance API deployments.
- Dependency audit leftovers: Circle's Solana/Ethers transitive tree reports 7 low + 16 moderate findings with no non-breaking upstream fix; Privy's MetaMask/x402 tree reports 10 moderate `uuid` findings. Both scans report **zero high or critical** findings after the upgrades.
