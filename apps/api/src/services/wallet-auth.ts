import { verifyMessage, type Hex } from "viem";
import { ARC_TESTNET_CHAIN_ID, normalizeWalletAddress } from "@coretta/shared";
import { loginWithIdentity } from "./auth.js";
import { trackUsageEvent } from "./limits.js";
import { createAuditEvent } from "./audit.js";
import { activateSmartWallet } from "./wallet-binding.js";
import { recordWalletInteraction } from "./wallet-interactions.js";
import { prisma } from "@coretta/db";

const OWNERSHIP_MESSAGE_RE =
  /Sign this message to verify ownership of your wallet and activate your Coretta session\.\s*\n\s*\nAddress:\s*(0x[a-fA-F0-9]{40})\s*\nChain ID:\s*(\d+)\s*\nIssued At:\s*([^\n]+)/i;

const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;

export function parseOwnershipMessage(message: string): {
  address: string;
  chainId: number;
  issuedAt: Date;
} | null {
  const m = message.match(OWNERSHIP_MESSAGE_RE);
  if (!m) return null;
  const issuedAt = new Date(m[3].trim());
  if (Number.isNaN(issuedAt.getTime())) return null;
  return {
    address: m[1],
    chainId: parseInt(m[2], 10),
    issuedAt,
  };
}

export async function verifyWalletOwnershipSignature(params: {
  address: string;
  message: string;
  signature: string;
}) {
  const expected = normalizeWalletAddress(params.address);
  const parsed = parseOwnershipMessage(params.message);
  if (!parsed) {
    throw new Error("INVALID_OWNERSHIP_MESSAGE");
  }
  if (normalizeWalletAddress(parsed.address) !== expected) {
    throw new Error("ADDRESS_MISMATCH");
  }
  if (parsed.chainId !== ARC_TESTNET_CHAIN_ID) {
    throw new Error("WRONG_CHAIN");
  }
  const age = Date.now() - parsed.issuedAt.getTime();
  if (age < -60_000 || age > MAX_MESSAGE_AGE_MS) {
    throw new Error("MESSAGE_EXPIRED");
  }

  const valid = await verifyMessage({
    address: expected as Hex,
    message: params.message,
    signature: params.signature as Hex,
  });
  if (!valid) {
    throw new Error("INVALID_SIGNATURE");
  }

  return expected;
}

export async function authenticateWalletOwnership(params: {
  address: string;
  message: string;
  signature: string;
}) {
  const expected = await verifyWalletOwnershipSignature(params);

  const { token, user, expiresAt } = await loginWithIdentity("wallet", expected);

  // Bind + activate smart wallet to the connected EOA — email not required.
  const binding = await activateSmartWallet(user.id, expected);
  await trackUsageEvent({
    walletAddress: expected,
    userId: user.id,
    key: "connectionCount",
  });
  await trackUsageEvent({
    walletAddress: expected,
    userId: user.id,
    key: "signatureRequestCount",
  });
  await createAuditEvent({
    actorId: user.id,
    action: "WALLET_OWNERSHIP_VERIFIED",
    metadata: { address: expected, chainId: ARC_TESTNET_CHAIN_ID },
  });

  await recordWalletInteraction({
    userId: user.id,
    walletAddress: expected,
    kind: "session",
    label: "Wallet connected and ownership verified",
    status: "complete",
    metadata: {
      chainId: ARC_TESTNET_CHAIN_ID,
      smartWalletAddress: binding.smartWalletAddress,
    },
  });

  return {
    token,
    user,
    expiresAt,
    walletAddress: expected,
    smartWalletAddress: binding.smartWalletAddress,
    smartWalletActivated: binding.smartWalletActivated,
    boundPrimaryWallet: binding.boundPrimaryWallet,
  };
}

/** Link a verified external wallet as another sign-in method for an existing user. */
export async function linkWalletIdentity(
  userId: string,
  params: { address: string; message: string; signature: string },
) {
  const expected = await verifyWalletOwnershipSignature(params);
  const existing = await prisma.identity.findUnique({
    where: {
      type_normalizedValue: { type: "wallet", normalizedValue: expected },
    },
  });
  if (existing && existing.userId !== userId) {
    throw new Error("WALLET_ALREADY_LINKED");
  }
  if (!existing) {
    await prisma.identity.create({
      data: {
        userId,
        type: "wallet",
        normalizedValue: expected,
        verifiedAt: new Date(),
      },
    });
  }

  const binding = await activateSmartWallet(userId, expected);
  await createAuditEvent({
    actorId: userId,
    action: "EXTERNAL_WALLET_LINKED",
    metadata: { address: expected, chainId: ARC_TESTNET_CHAIN_ID },
  });

  return {
    walletAddress: expected,
    smartWalletAddress: binding.smartWalletAddress,
    boundPrimaryWallet: binding.boundPrimaryWallet,
    smartWalletActivated: binding.smartWalletActivated,
  };
}
