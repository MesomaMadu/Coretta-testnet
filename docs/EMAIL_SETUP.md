# Privy email authentication

Coretta uses Privy's email OTP UI and token service. Privy sends and verifies the code in the browser; the Coretta API independently verifies the resulting Privy access token, fetches the verified email from Privy, and issues its own seven-day Coretta session. The browser-supplied email is never trusted by the API.

## Get the credentials

1. Create an application at [dashboard.privy.io](https://dashboard.privy.io/).
2. Open **Configuration → App settings → Basics**.
3. Copy the **App ID** and **App Secret**. The App ID is public; the App Secret must exist only on the API host.
4. Open **User management → Authentication** and enable **Email** as a login method.
5. Open **Configuration → App settings → Domains** and add `http://localhost:3000` plus each production HTTPS origin.
6. Recommended: create separate Privy applications for development and production.

## Environment variables

API (`.env` or the API host's secret store):

```dotenv
PRIVY_APP_ID=your_app_id
PRIVY_APP_SECRET=your_app_secret
# Optional, from App settings → Basics → Verify with key instead
PRIVY_JWT_VERIFICATION_KEY="-----BEGIN PUBLIC KEY-----..."
```

Next app (`apps/landing/.env.local` or Vercel):

```dotenv
NEXT_PUBLIC_PRIVY_APP_ID=your_app_id
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Use the same App ID on both sides. Never expose `PRIVY_APP_SECRET` through a `NEXT_PUBLIC_*` variable or commit it.

## Request flow

1. `@privy-io/react-auth` sends the email code and verifies it.
2. The browser obtains a short-lived Privy access token.
3. It calls `POST /v1/auth/privy` with `Authorization: Bearer <privy-access-token>`.
4. `@privy-io/node` validates the token and retrieves the verified Privy email.
5. Coretta provisions/fetches the account and returns its own session token.

The legacy `/v1/auth/otp/send` and `/v1/auth/otp/verify` routes intentionally return HTTP 410; code delivery now belongs to Privy.
