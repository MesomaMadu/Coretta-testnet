import { prisma } from "@arcremit/db";
import {
  createSmartAccountFromOwnerKey,
  createArcPublicClient,
  getUsdcBalanceMicro,
} from "@arcremit/chain";
import { generatePrivateKey } from "viem/accounts";
import type { Hex } from "viem";
import { encryptPrivateKey } from "../lib/crypto.js";
import { config } from "../config.js";
import {
  normalizeEmail,
  normalizePhone,
  normalizeWalletAddress,
  type IdentityType,
} from "@arcremit/shared";

const client = createArcPublicClient();

function normalizeIdentity(type: IdentityType, value: string): string {
  if (type === "email") return normalizeEmail(value);
  if (type === "phone") return normalizePhone(value);
  return normalizeWalletAddress(value);
}

export async function findUserByIdentity(
  type: IdentityType,
  value: string,
) {
  const normalized = normalizeIdentity(type, value);
  const identity = await prisma.identity.findUnique({
    where: { type_normalizedValue: { type, normalizedValue: normalized } },
    include: { user: { include: { wallets: true, limits: true, identities: true } } },
  });
  return identity?.user ?? null;
}

export async function provisionUserWithWallet(
  type: IdentityType,
  value: string,
) {
  const normalized = normalizeIdentity(type, value);

  const existing = await prisma.identity.findUnique({
    where: { type_normalizedValue: { type, normalizedValue: normalized } },
  });
  if (existing) {
    return prisma.user.findUniqueOrThrow({
      where: { id: existing.userId },
      include: { wallets: true, limits: true, identities: true },
    });
  }

  const ownerPrivateKey = generatePrivateKey();
  const { account, ownerAddress } =
    await createSmartAccountFromOwnerKey(ownerPrivateKey, client);
  const keyRef = encryptPrivateKey(
    ownerPrivateKey,
    config.walletEncryptionKey,
  );

  const user = await prisma.user.create({
    data: {
      identities: {
        create: { type, normalizedValue: normalized, verifiedAt: new Date() },
      },
      wallets: {
        create: {
          scaAddress: account.address,
          // For EOA wallet login, record the verified EOA as ownerAddress.
          ownerAddress: type === "wallet" ? normalized : ownerAddress,
          ownerKeyRef: keyRef,
          counterfactual: false,
          vendor: "safe_4337_v07",
        },
      },
      limits: {
        create: {},
      },
    },
    include: { wallets: true, limits: true, identities: true },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "WALLET_PROVISIONED",
      metadata: JSON.stringify({
        scaAddress: account.address,
        type,
        eoa: type === "wallet" ? normalized : undefined,
      }),
    },
  });

  return user;
}

export async function resolveRecipientWallet(
  type: IdentityType,
  value: string,
) {
  if (type === "wallet") {
    const normalized = normalizeWalletAddress(value);

    // Existing EOA identity (connected-wallet account)
    let user = await findUserByIdentity("wallet", normalized);
    if (user?.wallets[0]) {
      return { user, wallet: user.wallets[0] };
    }

    // Existing SCA or owner EOA on a Wallet row
    const byAddress = await prisma.wallet.findFirst({
      where: {
        OR: [
          { scaAddress: { equals: normalized } },
          { ownerAddress: { equals: normalized } },
        ],
      },
      include: {
        user: { include: { wallets: true, limits: true, identities: true } },
      },
    });
    if (byAddress?.user) {
      return { user: byAddress.user, wallet: byAddress };
    }

    // First-time EOA recipient: provision smart wallet bound to that address
    user = await provisionUserWithWallet("wallet", normalized);
    const wallet = user.wallets[0];
    if (!wallet) throw new Error("WALLET_MISSING");
    return { user, wallet };
  }

  let user = await findUserByIdentity(type, value);
  if (!user) {
    user = await provisionUserWithWallet(type, value);
  }
  const wallet = user.wallets[0];
  if (!wallet) throw new Error("WALLET_MISSING");
  return { user, wallet };
}

export async function getWalletBalanceMicro(scaAddress: Hex) {
  return getUsdcBalanceMicro(client, scaAddress);
}

export async function getOwnerKeyForWallet(walletId: string): Promise<Hex> {
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
  });
  if (!wallet.ownerKeyRef) {
    throw new Error("OWNER_KEY_UNAVAILABLE");
  }
  const { decryptPrivateKey } = await import("../lib/crypto.js");
  return decryptPrivateKey(wallet.ownerKeyRef, config.walletEncryptionKey);
}
