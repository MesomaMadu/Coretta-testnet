import { createPublicKey } from "node:crypto";

/**
 * Privy's optional verification-key override must be an SPKI public key.
 * Invalid overrides are ignored so the SDK can fetch the app's current JWKS.
 */
export function normalizePrivyJwtVerificationKey(
  value: string | undefined,
): string | undefined {
  const candidate = value?.trim().replace(/\\n/g, "\n");
  if (!candidate) return undefined;

  try {
    const key = createPublicKey(candidate);
    if (key.type !== "public" || key.asymmetricKeyType !== "ec") return undefined;
    return candidate;
  } catch {
    return undefined;
  }
}
