import { randomBytes } from "node:crypto";
import { prisma } from "@coretta/db";
import {
  getOrCreateActorForUser,
  getPreferences,
  setPreference,
} from "./ai.js";
import { createAuditEvent } from "./audit.js";

const PREF_BOUND_WALLET = "boundPrimaryWallet";
const PREF_SMART_ACTIVE = "smartWalletActivated";
const PREF_SMART_ACTIVATED_AT = "smartWalletActivatedAt";

export async function getWalletBindingStatus(userId: string) {
  const actor = await getOrCreateActorForUser(userId);
  const prefs = await getPreferences(actor.id);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { identities: true, wallets: true },
  });
  const email = user?.identities.find((i) => i.type === "email")?.normalizedValue;
  return {
    boundPrimaryWallet: prefs[PREF_BOUND_WALLET] ?? null,
    smartWalletActivated: prefs[PREF_SMART_ACTIVE] === "true",
    smartWalletActivatedAt: prefs[PREF_SMART_ACTIVATED_AT] ?? null,
    smartWalletAddress: user?.wallets[0]?.scaAddress ?? null,
    verifiedEmail: email ?? null,
  };
}

export async function activateSmartWallet(userId: string, primaryWalletAddress: string) {
  const actor = await getOrCreateActorForUser(userId);
  const normalized = primaryWalletAddress.toLowerCase();
  await setPreference(actor.id, PREF_BOUND_WALLET, normalized);
  await setPreference(actor.id, PREF_SMART_ACTIVE, "true");
  await setPreference(actor.id, PREF_SMART_ACTIVATED_AT, new Date().toISOString());
  await createAuditEvent({
    actorId: userId,
    action: "SMART_WALLET_ACTIVATED",
    metadata: { primaryWalletAddress: normalized },
  });
  await createAuditEvent({
    actorId: userId,
    action: "WALLET_BOUND",
    metadata: { primaryWalletAddress: normalized },
  });
  return getWalletBindingStatus(userId);
}

export async function bindPrimaryWallet(userId: string, primaryWalletAddress: string) {
  const actor = await getOrCreateActorForUser(userId);
  const normalized = primaryWalletAddress.toLowerCase();
  await setPreference(actor.id, PREF_BOUND_WALLET, normalized);
  await createAuditEvent({
    actorId: userId,
    action: "WALLET_BOUND",
    metadata: { primaryWalletAddress: normalized },
  });
  return getWalletBindingStatus(userId);
}

export async function replacePrimaryWallet(
  userId: string,
  newWalletAddress: string,
  previousWalletAddress?: string | null,
) {
  const actor = await getOrCreateActorForUser(userId);
  const prefs = await getPreferences(actor.id);
  const previous = previousWalletAddress?.toLowerCase() ?? prefs[PREF_BOUND_WALLET] ?? null;
  const normalized = newWalletAddress.toLowerCase();

  if (previous && previous === normalized) {
    throw new Error("SAME_WALLET");
  }

  await setPreference(actor.id, PREF_BOUND_WALLET, normalized);
  await createAuditEvent({
    actorId: userId,
    action: "WALLET_REPLACED",
    metadata: {
      previousWalletAddress: previous,
      newWalletAddress: normalized,
    },
  });

  return {
    ...((await getWalletBindingStatus(userId)) as object),
    previousWalletAddress: previous,
    revokedWalletAddress: previous,
  };
}

const rebindTokens = new Map<string, { userId: string; email: string; expiresAt: number }>();

export function issueRebindToken(userId: string, email: string): string {
  const token = randomBytes(24).toString("hex");
  rebindTokens.set(token, {
    userId,
    email: email.toLowerCase(),
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  return token;
}

export function consumeRebindToken(token: string, userId: string): boolean {
  const record = rebindTokens.get(token);
  if (!record || record.userId !== userId) return false;
  if (Date.now() > record.expiresAt) {
    rebindTokens.delete(token);
    return false;
  }
  rebindTokens.delete(token);
  return true;
}
