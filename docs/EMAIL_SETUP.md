# Email OTP Configuration Report

## Required

| Item | Status |
|------|--------|
| Email Provider API Key (`EMAIL_PROVIDER_API_KEY`) | ⚠ Manual Configuration Required |
| Sender Email Address (`EMAIL_FROM_ADDRESS`) | ⚠ Manual Configuration Required |
| Domain Verification Status (Resend dashboard) | ⚠ Manual Configuration Required |
| SMTP/API Configuration | ⚠ Manual Configuration Required — uses Resend HTTP API via `fetch` |

## Environment Variables

| Variable | Status |
|----------|--------|
| `EMAIL_PROVIDER_API_KEY` | ⚠ Manual Configuration Required |
| `EMAIL_FROM_ADDRESS` | ⚠ Manual Configuration Required |
| `DEV_MODE=true` | ✓ Logs OTP to API server console when provider unset |

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /v1/auth/otp/send` | Generate and email 6-digit code |
| `POST /v1/auth/otp/verify` | Validate code and issue session |

## Security Defaults

- OTP expiration: **5 minutes**
- Maximum failed attempts: **5**
- Resend cooldown: **30 seconds**
- Single-use codes with SHA-256 hashing at rest (in-memory store; use Redis/DB for production)

## Local Development

With `DEV_MODE=true` and no email provider configured, codes are printed to the API server console:

```
[DEV_MODE OTP] user@example.com → 123456
```

**Do not use this mode in production.**
