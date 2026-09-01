import { PrivyClient } from "@privy-io/node";
import { config } from "../config.js";
import { prisma } from "@coretta/db";
import { normalizeEmail } from "@coretta/shared";
import { log } from "../lib/log.js";
import { normalizePrivyJwtVerificationKey } from "../lib/privy-verification.js";
import { createSessionForUser, loginWithIdentity } from "./auth.js";

let client: PrivyClient | null = null;

export function isPrivyConnectivityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /connection|failed to fetch|network|timeout|timed out|ECONN|ENOTFOUND|EAI_AGAIN/i.test(
    message,
  );
}

export function isPrivyConfigured(): boolean {
  return Boolean(config.privyAppId && config.privyAppSecret);
}

function getPrivyClient(): PrivyClient {
  if (!config.privyAppId || !config.privyAppSecret) {
    throw new Error("PRIVY_NOT_CONFIGURED");
  }
  const verificationKey = normalizePrivyJwtVerificationKey(
    config.privyJwtVerificationKey,
  );
  if (config.privyJwtVerificationKey && !verificationKey) {
    log.warn(
      "auth",
      "Ignoring invalid PRIVY_JWT_VERIFICATION_KEY and using Privy's JWKS",
    );
  }
  client ??= new PrivyClient({
    appId: config.privyAppId,
    appSecret: config.privyAppSecret,
    ...(verificationKey ? { jwtVerificationKey: verificationKey } : {}),
  });
  return client;
}

/** Only server-verified Privy accounts may supply the Coretta email identity. */
export function getVerifiedPrivyEmail(accounts: Array<{
  type: string;
  verified_at?: number;
  address?: string | null;
  email?: string | null;
  subject?: string | null;
}>) {
  const verified = accounts.filter((account) =>
    Number.isFinite(account.verified_at) && (account.verified_at ?? 0) > 0,
  );
  const emailAccount = verified.find((account) => account.type === "email" && account.address);
  const googleAccount = verified.find((account) => account.type === "google_oauth" && account.subject && account.email);
  const email = emailAccount?.address ?? googleAccount?.email;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error("PRIVY_EMAIL_REQUIRED");
  return normalizeEmail(email);
}

/** Verify Privy's access token and resolve email OTP or Google without provisioning. */
export async function inspectPrivyEmailAccount(accessToken: string) {
  if (!accessToken) throw new Error("PRIVY_TOKEN_MISSING");

  const privy = getPrivyClient();
  const token = await privy.utils().auth().verifyAccessToken(accessToken);
  const privyUser = await privy.users()._get(token.user_id);
  const email = getVerifiedPrivyEmail(privyUser.linked_accounts);
  const identity = await prisma.identity.findUnique({
    where: { type_normalizedValue: { type: "email", normalizedValue: email } },
    include: { user: { include: { wallets: true } } },
  });

  return {
    email,
    privyUserId: token.user_id,
    existing: Boolean(identity),
    smartWalletAddress: identity?.user.wallets[0]?.scaAddress ?? null,
  };
}

/** Verify Privy's access token server-side and issue a Coretta session. */
export async function authenticatePrivyEmail(
  accessToken: string,
  linkToUserId?: string,
) {
  const account = await inspectPrivyEmailAccount(accessToken);
  const { email } = account;
  let session;
  if (linkToUserId) {
    const existing = await prisma.identity.findUnique({
      where: { type_normalizedValue: { type: "email", normalizedValue: email } },
    });
    if (existing && existing.userId !== linkToUserId) {
      throw new Error("EMAIL_ALREADY_LINKED");
    }
    if (!existing) {
      await prisma.identity.create({
        data: {
          userId: linkToUserId,
          type: "email",
          normalizedValue: email,
          verifiedAt: new Date(),
        },
      });
    }
    session = await createSessionForUser(linkToUserId);
  } else {
    session = await loginWithIdentity("email", email);
  }
  return {
    ...session,
    email,
    privyUserId: account.privyUserId,
  };
}
