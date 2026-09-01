import { prisma } from "@coretta/db";
import { randomBytes } from "node:crypto";
import { hashSessionToken } from "../lib/crypto.js";
import { provisionUserWithWallet } from "./wallet.js";
import type { IdentityType } from "@coretta/shared";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_CACHE_TTL_MS = 30_000;
const SESSION_CACHE_MAX = 500;
type ResolvedSession = Awaited<ReturnType<typeof loadSession>>;
const sessionCache = new Map<string, { value: ResolvedSession; validUntil: number }>();
const sessionLoads = new Map<string, Promise<ResolvedSession>>();

/** Drop cached snapshots after identities or wallet bindings change. */
export function invalidateSessionsForUser(userId: string) {
  for (const [tokenHash, cached] of sessionCache) {
    if (cached.value?.id === userId) sessionCache.delete(tokenHash);
  }
}

async function loadSession(tokenHash: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: { include: { wallets: true, identities: true, limits: true } },
    },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

export async function loginWithIdentity(type: IdentityType, value: string) {
  const user = await provisionUserWithWallet(type, value);
  return createSessionForUser(user.id);
}

export async function createSessionForUser(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: { userId, tokenHash, expiresAt },
  });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { wallets: true, limits: true, identities: true },
  });
  return { token, user, expiresAt };
}

export async function resolveSession(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const tokenHash = hashSessionToken(token);
  const now = Date.now();
  const cached = sessionCache.get(tokenHash);
  if (cached && cached.validUntil > now) return cached.value;

  let pending = sessionLoads.get(tokenHash);
  if (!pending) {
    pending = loadSession(tokenHash).then((value) => {
      if (sessionCache.size >= SESSION_CACHE_MAX) {
        const oldest = sessionCache.keys().next().value as string | undefined;
        if (oldest) sessionCache.delete(oldest);
      }
      sessionCache.set(tokenHash, { value, validUntil: Date.now() + SESSION_CACHE_TTL_MS });
      return value;
    }).finally(() => {
      sessionLoads.delete(tokenHash);
    });
    sessionLoads.set(tokenHash, pending);
  }
  return pending;
}
