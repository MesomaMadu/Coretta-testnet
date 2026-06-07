import { prisma } from "@arcremit/db";
import { randomBytes } from "node:crypto";
import { hashSessionToken } from "../lib/crypto.js";
import { provisionUserWithWallet } from "./wallet.js";
import type { IdentityType } from "@arcremit/shared";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function loginWithIdentity(type: IdentityType, value: string) {
  const user = await provisionUserWithWallet(type, value);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  return { token, user, expiresAt };
}

export async function resolveSession(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: { include: { wallets: true, identities: true, limits: true } },
    },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}
