import { verifyMessage, type Hex } from "viem";
import {
  ARC_TESTNET_CHAIN_ID,
  normalizeWalletAddress,
  type RemitRequest,
  type TransactionAuthorizationIntent,
} from "@coretta/shared";
import type { AuthUser } from "../types.js";

const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;
const usedSwapNonces = new Map<string, number>();

/**
 * Privy email-only accounts authorize managed-wallet actions with their
 * authenticated Coretta session. Once an external wallet identity is linked,
 * that wallet must sign every supported transaction request.
 */
export function requiresWalletTransactionAuthorization(
  user: Pick<AuthUser, "identities">,
): boolean {
  const hasVerifiedEmail = user.identities.some(
    (identity) => identity.type === "email" && identity.verifiedAt !== null,
  );
  const hasLinkedWallet = user.identities.some(
    (identity) => identity.type === "wallet" && identity.verifiedAt !== null,
  );
  return !hasVerifiedEmail || hasLinkedWallet;
}

export interface ParsedTransactionAuthorization {
  address: string;
  chainId: number;
  issuedAt: Date;
  intent: TransactionAuthorizationIntent;
}

export function parseTransactionAuthorizationMessage(
  message: string,
): ParsedTransactionAuthorization | null {
  if (!message.startsWith("Authorize Coretta transaction\n")) return null;
  const wallet = message.match(/^Wallet:\s*(0x[a-fA-F0-9]{40})\s*$/m)?.[1];
  const chain = message.match(/^Chain ID:\s*(\d+)\s*$/m)?.[1];
  const issued = message.match(/^Issued At:\s*([^\r\n]+)\s*$/m)?.[1];
  const intentText = message.match(/^Intent:\s*(\{[^\r\n]+\})\s*$/m)?.[1];
  if (!wallet || !chain || !issued || !intentText) return null;

  const issuedAt = new Date(issued);
  if (Number.isNaN(issuedAt.getTime())) return null;
  try {
    const intent: unknown = JSON.parse(intentText);
    if (!intent || typeof intent !== "object" || !("action" in intent)) return null;
    return {
      address: normalizeWalletAddress(wallet),
      chainId: Number(chain),
      issuedAt,
      intent: intent as TransactionAuthorizationIntent,
    };
  } catch {
    return null;
  }
}

function isLinkedWallet(user: AuthUser, address: string): boolean {
  return (
    user.identities.some(
      (identity) =>
        identity.type === "wallet" && identity.normalizedValue === address,
    ) ||
    user.wallets.some(
      (wallet) => wallet.ownerAddress?.toLowerCase() === address,
    )
  );
}

function sameRemitRequest(a: RemitRequest, b: RemitRequest): boolean {
  return (
    a.recipient.type === b.recipient.type &&
    a.recipient.value === b.recipient.value &&
    a.amount === b.amount &&
    (a.asset ?? "USDC") === (b.asset ?? "USDC") &&
    a.idempotencyKey === b.idempotencyKey
  );
}

function pruneUsedSwapNonces(now: number) {
  for (const [key, expiry] of usedSwapNonces) {
    if (expiry <= now) usedSwapNonces.delete(key);
  }
}

export async function authorizeRemit(params: {
  user: AuthUser;
  message: string;
  signature: string;
  request: RemitRequest;
}) {
  const parsed = await verifyAuthorization(params);
  if (
    parsed.intent.action !== "remit" ||
    !Array.isArray(parsed.intent.requests) ||
    !parsed.intent.requests.some((request) => sameRemitRequest(request, params.request))
  ) {
    throw new Error("TRANSACTION_INTENT_MISMATCH");
  }
}

export async function authorizeSwap(params: {
  user: AuthUser;
  message: string;
  signature: string;
  tokenIn: "USDC" | "EURC";
  tokenOut: "USDC" | "EURC";
  amountIn: string;
}) {
  const parsed = await verifyAuthorization(params);
  if (
    parsed.intent.action !== "swap" ||
    parsed.intent.tokenIn !== params.tokenIn ||
    parsed.intent.tokenOut !== params.tokenOut ||
    parsed.intent.amountIn !== params.amountIn ||
    typeof parsed.intent.nonce !== "string" ||
    parsed.intent.nonce.length < 16
  ) {
    throw new Error("TRANSACTION_INTENT_MISMATCH");
  }

  const now = Date.now();
  pruneUsedSwapNonces(now);
  const nonceKey = `${params.user.id}:${parsed.intent.nonce}`;
  if (usedSwapNonces.has(nonceKey)) throw new Error("AUTHORIZATION_REPLAYED");
  usedSwapNonces.set(nonceKey, now + MAX_MESSAGE_AGE_MS);
}

async function verifyAuthorization(params: {
  user: AuthUser;
  message: string;
  signature: string;
}): Promise<ParsedTransactionAuthorization> {
  const parsed = parseTransactionAuthorizationMessage(params.message);
  if (!parsed) throw new Error("INVALID_TRANSACTION_AUTHORIZATION");
  if (parsed.chainId !== ARC_TESTNET_CHAIN_ID) throw new Error("WRONG_CHAIN");

  const age = Date.now() - parsed.issuedAt.getTime();
  if (age < -60_000 || age > MAX_MESSAGE_AGE_MS) {
    throw new Error("AUTHORIZATION_EXPIRED");
  }
  if (!isLinkedWallet(params.user, parsed.address)) {
    throw new Error("WALLET_NOT_LINKED");
  }

  const valid = await verifyMessage({
    address: parsed.address as Hex,
    message: params.message,
    signature: params.signature as Hex,
  });
  if (!valid) throw new Error("INVALID_TRANSACTION_SIGNATURE");
  return parsed;
}
