import { createHash } from "node:crypto";

interface RateLimitRecord {
  count: number;
  resetAt: number;
  blockedUntil?: number;
}

const memoryStore = new Map<string, RateLimitRecord>();

export function generateFingerprint(ip: string, userAgent?: string, walletAddress?: string): string {
  const raw = `${ip}:${userAgent ?? "unknown"}:${walletAddress ?? "anonymous"}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export function checkSecurityRateLimit(
  fingerprint: string,
  action: "otp" | "ai" | "swap" | "tx",
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const key = `${action}:${fingerprint}`;
  const record = memoryStore.get(key);

  if (record?.blockedUntil && now < record.blockedUntil) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((record.blockedUntil - now) / 1000),
    };
  }

  if (!record || now > record.resetAt) {
    memoryStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { allowed: true };
  }

  record.count += 1;

  if (record.count > maxRequests) {
    // Exponential backoff block (10 minutes)
    record.blockedUntil = now + 10 * 60 * 1000;
    return {
      allowed: false,
      retryAfterSeconds: 600,
    };
  }

  return { allowed: true };
}
