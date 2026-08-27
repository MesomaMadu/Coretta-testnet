# Coretta

Coretta is an Arc Testnet remittance application for sending and swapping supported stablecoins through a conversational assistant. The product combines Privy authentication, Circle developer-controlled wallets, Prisma and Supabase PostgreSQL, transaction previews, mandatory approval, activity history, and an optional server-side xAI conversation model.

## Applications

| Path | Purpose |
|------|---------|
| `apps/landing` | Primary Next.js landing site and Coretta application |
| `apps/api` | Fastify API for authentication, wallets, transfers, swaps, chat, and activity |
| `apps/web` | Legacy Vite interface retained for compatibility |
| `packages/db` | Prisma schema and migrations for Supabase PostgreSQL |
| `packages/chain` | Arc clients, bundler integration, and transaction helpers |
| `packages/shared` | Shared chain constants, validation, and policy types |

## User flow

1. The public landing page opens at `/`.
2. `/app` checks the local onboarding version and redirects new users to `/app/onboarding`.
3. Users authenticate with Privy email OTP or an EVM wallet ownership signature.
4. Coretta restores or provisions the linked Circle developer-controlled smart wallet.
5. The dashboard shows combined balances, token details, and activity.
6. Chat prepares a locked transaction preview. Funds cannot move until the user confirms and signs.
7. Pending, settled, and failed activity entries expose their full transaction details.

The application includes Dashboard, Chat, Usage, and Settings sections. Chat memory, transaction-history access, and saved-recipient lookup have independent user controls.

## Requirements

- Node.js 20 or newer
- npm
- A Supabase PostgreSQL project
- Privy application credentials
- Circle developer-controlled wallet credentials
- An Arc Testnet RPC URL and bundler URL
- A WalletConnect project ID for external-wallet support
- An optional xAI API key for natural Damian responses

## Local setup

Install the root packages and the separate landing application dependencies:

```bash
npm install
npm install --prefix apps/landing --legacy-peer-deps
```

Copy the example environment files without committing the resulting files:

```bash
cp .env.example .env
cp apps/landing/.env.example apps/landing/.env.local
```

Generate Prisma and apply committed migrations:

```bash
npm run db:generate
npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

Start the API and primary application:

```bash
npm run dev
```

Local endpoints:

- Landing: `http://localhost:3000`
- Onboarding: `http://localhost:3000/app/onboarding`
- Application: `http://localhost:3000/app`
- API: `http://localhost:3001`
- API health: `http://localhost:3001/health`
- Database health: `http://localhost:3001/health/database`

## Configuration

Start from `.env.example`, `apps/api/.env.example`, and `apps/landing/.env.example`. Real values belong only in local ignored files or deployment-provider secret storage.

API variables:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Supabase pooler connection used by the runtime |
| `DIRECT_URL` | Direct or session-pooler connection used for migrations |
| `SESSION_SECRET` | Coretta session signing secret |
| `WALLET_ENCRYPTION_KEY` | Encryption key for managed-wallet material |
| `CORS_ORIGIN` | Allowed landing and application origins |
| `ARC_TESTNET_RPC_URL` | Arc Testnet JSON-RPC endpoint |
| `BUNDLER_RPC_URL` | ERC-4337 bundler endpoint |
| `CIRCLE_API_KEY` | Circle server credential |
| `CIRCLE_ENTITY_SECRET` | Circle entity secret |
| `CIRCLE_WALLET_SET_ID` | Circle wallet-set identifier |
| `PRIVY_APP_ID` | Privy application identifier |
| `PRIVY_APP_SECRET` | Privy server secret |
| `PRIVY_JWT_VERIFICATION_KEY` | Optional local JWT verification key |
| `XAI_API_KEY` | Optional server-only xAI credential |
| `XAI_MODEL` | Optional xAI model name, defaults to `grok-4.3` |

Landing variables:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | Public URL of the deployed Coretta API |
| `NEXT_PUBLIC_APP_URL` | Public application URL |
| `NEXT_PUBLIC_WC_PROJECT_ID` | WalletConnect project identifier |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Browser-safe Privy application identifier |

Never add `NEXT_PUBLIC_` to a server secret.

### Damian encryption-key compatibility

Existing encrypted Damian messages were written with `SESSION_SECRET` as the fallback key. Leave `AI_MEMORY_KEY` unset until a dual-key reader and one-time data migration are deployed. The rotation must also preserve or migrate the actor hashes currently derived from the same key. Setting a new value without that migration can make existing conversations unreadable or unreachable.

## Verification

Run the same checks expected before deployment:

```bash
npm run lint
npm test
npm run build
```

The tests cover transaction authorization, intent preservation, wallet ownership parsing, saved-recipient validation, provider redaction, memory summaries, Arc asset selection, and prompt-injection handling.

## Database deployment

Prisma migrations are stored in `packages/db/prisma/migrations`. Check the linked Supabase database before deployment:

```bash
npx prisma migrate status --schema packages/db/prisma/schema.prisma
```

Apply only committed pending migrations:

```bash
npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

All Coretta tables in Supabase's exposed `public` schema have RLS enabled. The
`anon` and `authenticated` database roles have no table access because Coretta
uses Prisma from the API server instead of querying Supabase from the browser.
Any future browser-facing table must receive explicit grants, matching RLS
policies, and access tests in the same migration.

Do not use `prisma db push` against production.

## Vercel deployment

Coretta uses two Vercel projects:

| Project | Root directory | Role |
|---------|----------------|------|
| `coretta-testnet-api` | `apps/api` | Fastify API |
| `coretta-landing-page-test` | `apps/landing` | Landing and application |

Deploy the API first, verify `/health` and `/health/database`, then deploy the landing project. Environment-variable changes apply only to new deployments.

The xAI key must be stored as a Sensitive variable named exactly `XAI_API_KEY` in the API project. Configure it separately for Preview and Production. Keep `XAI_MODEL` in those same scopes.

See `docs/VERCEL_DEPLOYMENT.md` and `docs/PRODUCTION_READINESS.md` for the full checklist.

## Repository security

- `.env*`, `.vercel`, Supabase temporary linkage data, database files, private keys, recovery exports, and entity-secret backups are ignored.
- Commit only example environment files containing placeholders.
- Keep Circle, Privy, xAI, database, bundler, and encryption values in local ignored files or Vercel Sensitive variables.
- Rotate any credential that is exposed in a terminal transcript, screenshot, chat, commit, or build log.

## References

- [Arc Testnet](https://docs.arc.io/arc/references/connect-to-arc)
- [Circle developer-controlled wallets](https://developers.circle.com/wallets/dev-controlled)
- [Circle Paymaster](https://developers.circle.com/paymaster/pay-gas-fees-usdc)
- [Privy React authentication](https://docs.privy.io/basics/react/setup)
- [Prisma migrations](https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
