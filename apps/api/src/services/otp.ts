import { createHash, randomInt } from "node:crypto";
import { prisma } from "@coretta/db";

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashCode(email: string, code: string) {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}

function generateCode(): string {
  return String(randomInt(100000, 999999));
}

export async function createOtp(
  email: string,
  purpose: "LOGIN" | "REBIND" = "LOGIN"
): Promise<{ code: string; expiresAt: Date }> {
  const normalized = normalizeEmail(email);
  const now = new Date();

  // Check rate limit cooldown from database
  const existing = await prisma.otpToken.findFirst({
    where: { email: normalized, purpose, used: false },
    orderBy: { createdAt: "desc" },
  });

  if (existing && now.getTime() - existing.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now.getTime() - existing.lastSentAt.getTime())) / 1000);
    throw new Error(`RESEND_COOLDOWN:${wait}`);
  }

  const code = generateCode();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  await prisma.otpToken.create({
    data: {
      email: normalized,
      codeHash: hashCode(normalized, code),
      expiresAt,
      attempts: 0,
      used: false,
      purpose,
      lastSentAt: now,
    },
  });

  return { code, expiresAt };
}

export async function verifyOtp(
  email: string,
  code: string,
  purpose: "LOGIN" | "REBIND" = "LOGIN"
): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const now = new Date();

  const record = await prisma.otpToken.findFirst({
    where: {
      email: normalized,
      purpose,
      used: false,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record || record.attempts >= MAX_ATTEMPTS) return false;

  await prisma.otpToken.update({
    where: { id: record.id },
    data: { attempts: { increment: 1 } },
  });

  const ok = record.codeHash === hashCode(normalized, code);
  if (ok) {
    await prisma.otpToken.update({
      where: { id: record.id },
      data: { used: true },
    });
  }

  return ok;
}

export async function createRebindOtp(email: string): Promise<{ code: string; expiresAt: Date }> {
  return createOtp(email, "REBIND");
}

export async function verifyRebindOtp(email: string, code: string): Promise<boolean> {
  return verifyOtp(email, code, "REBIND");
}
