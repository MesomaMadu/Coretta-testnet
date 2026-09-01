import { verifyMessage, type Hex } from "viem";
import {
  ARC_TESTNET_CHAIN_ID,
  normalizeWalletAddress,
  type RemitRequest,
  type CctpEvmTestnetChainId,
  type TransactionAuthorizationIntent,
} from "@coretta/shared";
import type { AuthUser } from "../types.js";
import { prisma } from "@coretta/db";

const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;

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

async function consumeTransactionNonce(userId: string, nonce: string) {
  const now = new Date();
  await prisma.transactionAuthorizationNonce.deleteMany({
    where: { expiresAt: { lte: now } },
  });
  try {
    await prisma.transactionAuthorizationNonce.create({
      data: {
        userId,
        nonce,
        expiresAt: new Date(now.getTime() + MAX_MESSAGE_AGE_MS),
      },
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") throw new Error("AUTHORIZATION_REPLAYED");
    throw error;
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
  const intent =
    parsed.intent.action === "swap" ||
    parsed.intent.action === "swap_and_bridge"
      ? parsed.intent
      : null;
  const nonce =
    intent?.action === "swap_and_bridge" ? intent.swapNonce : intent?.nonce;
  if (
    !intent ||
    intent.tokenIn !== params.tokenIn ||
    intent.tokenOut !== params.tokenOut ||
    intent.amountIn !== params.amountIn ||
    typeof nonce !== "string" ||
    nonce.length < 16 ||
    nonce.length > 120
  ) {
    throw new Error("TRANSACTION_INTENT_MISMATCH");
  }

  await consumeTransactionNonce(params.user.id, nonce);
}

export async function authorizeSwapAndSend(params: {
  user: AuthUser;
  message: string;
  signature: string;
  tokenIn: "USDC" | "EURC";
  tokenOut: "USDC" | "EURC";
  amountIn: string;
  requests: RemitRequest[];
}) {
  const parsed = await verifyAuthorization(params);
  const intent = parsed.intent.action === "swap_and_send" ? parsed.intent : null;
  if (
    !intent ||
    !Array.isArray(intent.requests) ||
    intent.tokenIn !== params.tokenIn ||
    intent.tokenOut !== params.tokenOut ||
    intent.amountIn !== params.amountIn ||
    intent.requests.length !== params.requests.length ||
    !params.requests.every((request, index) =>
      sameRemitRequest(intent.requests[index], request),
    ) ||
    typeof intent.nonce !== "string" ||
    intent.nonce.length < 16 ||
    intent.nonce.length > 120
  ) {
    throw new Error("TRANSACTION_INTENT_MISMATCH");
  }
  await consumeTransactionNonce(params.user.id, intent.nonce);
}

export async function authorizeBridge(params: {
  user: AuthUser;
  message: string;
  signature: string;
  sourceChain: "Arc_Testnet";
  destinationChain: CctpEvmTestnetChainId;
  recipientAddress: string;
  amount: string;
  idempotencyKey: string;
}) {
  const parsed = await verifyAuthorization(params);
  const intent =
    parsed.intent.action === "bridge" ||
    parsed.intent.action === "swap_and_bridge"
      ? parsed.intent
      : null;
  const amount =
    intent?.action === "swap_and_bridge" ? intent.bridgeAmount : intent?.amount;
  const nonce =
    intent?.action === "swap_and_bridge" ? intent.bridgeNonce : intent?.nonce;
  if (
    !intent ||
    intent.sourceChain !== params.sourceChain ||
    intent.destinationChain !== params.destinationChain ||
    intent.recipientAddress.toLowerCase() !== params.recipientAddress.toLowerCase() ||
    amount !== params.amount ||
    intent.idempotencyKey !== params.idempotencyKey ||
    typeof nonce !== "string" ||
    nonce.length < 16 ||
    nonce.length > 120
  ) {
    throw new Error("TRANSACTION_INTENT_MISMATCH");
  }
  await consumeTransactionNonce(params.user.id, nonce);
}

export async function authorizeBridgeBatch(params: {
  user: AuthUser;
  message: string;
  signature: string;
  sourceChain: "Arc_Testnet";
  destinationChain: CctpEvmTestnetChainId;
  recipients: Array<{
    recipientAddress: string;
    amount: string;
    destinationChain: CctpEvmTestnetChainId;
  }>;
  idempotencyKey: string;
}) {
  const parsed = await verifyAuthorization(params);
  const intent = parsed.intent.action === "bridge_batch" ? parsed.intent : null;
  if (
    !intent ||
    intent.sourceChain !== params.sourceChain ||
    intent.destinationChain !== params.destinationChain ||
    intent.idempotencyKey !== params.idempotencyKey ||
    !Array.isArray(intent.recipients) ||
    intent.recipients.length !== params.recipients.length ||
    !params.recipients.every(
      (recipient, index) =>
        intent.recipients[index]?.recipientAddress.toLowerCase() ===
          recipient.recipientAddress.toLowerCase() &&
        intent.recipients[index]?.amount === recipient.amount &&
        intent.recipients[index]?.destinationChain ===
          recipient.destinationChain,
    ) ||
    typeof intent.nonce !== "string" ||
    intent.nonce.length < 16 ||
    intent.nonce.length > 120
  ) {
    throw new Error("TRANSACTION_INTENT_MISMATCH");
  }
  await consumeTransactionNonce(params.user.id, intent.nonce);
}

export async function authorizeBridgeRetry(params: {
  user: AuthUser;
  message: string;
  signature: string;
  operationId: string;
}) {
  const parsed = await verifyAuthorization(params);
  const intent = parsed.intent.action === "bridge_retry" ? parsed.intent : null;
  if (
    !intent ||
    intent.operationId !== params.operationId ||
    typeof intent.nonce !== "string" ||
    intent.nonce.length < 16 ||
    intent.nonce.length > 120
  ) {
    throw new Error("TRANSACTION_INTENT_MISMATCH");
  }
  await consumeTransactionNonce(params.user.id, intent.nonce);
}

export async function authorizeBridgeBatchRetry(params: {
  user: AuthUser;
  message: string;
  signature: string;
  batchId: string;
  operationIds: string[];
}) {
  const parsed = await verifyAuthorization(params);
  const intent = parsed.intent.action === "bridge_batch_retry" ? parsed.intent : null;
  if (
    !intent ||
    intent.batchId !== params.batchId ||
    !Array.isArray(intent.operationIds) ||
    intent.operationIds.length !== params.operationIds.length ||
    !params.operationIds.every((operationId, index) => intent.operationIds[index] === operationId) ||
    typeof intent.nonce !== "string" ||
    intent.nonce.length < 16 ||
    intent.nonce.length > 120
  ) {
    throw new Error("TRANSACTION_INTENT_MISMATCH");
  }
  await consumeTransactionNonce(params.user.id, intent.nonce);
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
