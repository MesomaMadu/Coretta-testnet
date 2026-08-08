import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import type { Hex } from "viem";

const ALGO = "aes-256-gcm";

function keyFromSecret(secret: string): Buffer {
  return scryptSync(secret, "coretta-salt", 32);
}

export function encryptPrivateKey(hexKey: Hex, secret: string): string {
  const key = keyFromSecret(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(hexKey.slice(2), "hex"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptPrivateKey(payload: string, secret: string): Hex {
  const [, ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("INVALID_KEY_REF");
  const key = keyFromSecret(secret);
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return `0x${dec.toString("hex")}` as Hex;
}

export function hashSessionToken(token: string): string {
  return scryptSync(token, "session", 32).toString("hex");
}

export function encryptText(plainText: string, secret: string): string {
  const key = keyFromSecret(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `t1:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptText(payload: string, secret: string): string {
  const [ver, ivHex, tagHex, dataHex] = payload.split(":");
  if (ver !== "t1" || !ivHex || !tagHex || !dataHex) throw new Error("INVALID_TEXT_PAYLOAD");
  const key = keyFromSecret(secret);
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

/** Stable, non-reversible per-user actor hash (no PII). */
export function hashAiActor(userId: string, secret: string): string {
  return scryptSync(`${userId}`, `ai-actor:${secret}`, 32).toString("hex");
}
