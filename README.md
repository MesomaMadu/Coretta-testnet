# ArcRemit

Gasless-style USDC micro-remittance on **Arc Testnet** using **ERC-4337** Safe smart accounts, **Circle Paymaster** (USDC gas), and a **Pimlico-compatible** bundler.

## What’s included

| Package | Role |
|---------|------|
| `packages/shared` | Chain constants, policy limits, USDC parsing |
| `packages/chain` | Arc client, Circle Paymaster permit, bundler, UserOp send |
| `packages/db` | Prisma schema (users, wallets, transfers, limits) |
| `apps/api` | REST API: login, remit, transfers, policy engine |
| `apps/web` | Mobile-first React UI |
| `apps/landing` | Next.js marketing landing page |

### Product rules (implemented)

- **Direct transfer** to recipient smart wallet (no claim links)
- **Auto-provision** recipient wallet on first send to new email/phone
- **Policy**: max **$100** per transfer, daily limits, KYC tier gate
- **Circle Paymaster v0.7** on Arc Testnet (`0x31BE08D380A21fc740883c0BC434FcFc88740b58`)

## Prerequisites

- Node.js **20+**
- Testnet **USDC** on Arc: [faucet.circle.com](https://faucet.circle.com)

## Quick start

```bash
# Install
npm install

# Database
cp .env.example .env
npm run db:generate
npm run db:push

# Verify Arc RPC + bundler (optional)
npm run verify -w @arcremit/chain

# Run API + web
npm run dev
npm run dev:landing
```

- API: http://localhost:3001  
- Web: http://localhost:5173  
- Landing: http://localhost:3000  

## Send flow

1. Sign in with email → API provisions an **ERC-4337 Safe smart account** + encrypted owner key (dev model).
2. Fund your wallet address with USDC on Arc Testnet.
3. Send to another email → recipient wallet is created if needed → **UserOperation** transfers USDC; fees paid via **Circle Paymaster** (USDC permit).

## Production notes

**Testnet / dev wallet model:** Owner keys are generated server-side and encrypted at rest. For production, replace with **Circle Programmable Wallets API** (no raw keys on your server) and add real IdP (OTP, passkeys).

**Bundler:** Public Pimlico endpoint is rate-limited (~20 req/min). Use a [Pimlico API key](https://docs.pimlico.io/guides/create-api-key) and set `BUNDLER_RPC_URL`.

**Gas UX:** Circle Paymaster charges the sender’s USDC for network fees (documented behavior). True “zero fee” subsidy requires a separate treasury subsidy layer.

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/auth/login` | Email login + wallet provision |
| GET | `/v1/me` | Balance + wallet (auth) |
| POST | `/v1/remit` | Create + execute transfer |
| GET | `/v1/transfers` | History |

## References

- [Arc Testnet](https://docs.arc.network/arc/references/connect-to-arc)
- [Circle Paymaster](https://developers.circle.com/paymaster/pay-gas-fees-usdc)
- [Arc Account Abstraction](https://docs.arc.network/arc/tools/account-abstraction)
