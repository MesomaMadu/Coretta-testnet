import { prisma } from "@coretta/db";
import {
  createArcPublicClient,
  createSmartAccountFromOwnerKey,
  getEurcBalanceMicro,
  getUsdcBalanceMicro,
} from "@coretta/chain";
import { generatePrivateKey } from "viem/accounts";
import type { Address, Hex } from "viem";
import { config } from "../config.js";
import { encryptPrivateKey } from "../lib/crypto.js";
import {
  normalizeEmail,
  normalizePhone,
  normalizeWalletAddress,
  type IdentityType,
} from "@coretta/shared";
import {
  createCircleScaWallet,
  deployCircleScaOnChain,
} from "./circle.js";
import { log } from "../lib/log.js";

const client = createArcPublicClient(config.arcRpcUrl, {
  timeout: 3_000,
  retryCount: 0,
});

function circleConfigured() {
  return Boolean(
    config.circleApiKey &&
      config.circleEntitySecret &&
      config.circleWalletSetId,
  );
}

/**
 * Deploy a Circle SCA on-chain if still counterfactual.
 * Returns true when marked deployed (or already was).
 */
export async function ensureCircleScaDeployed(wallet: {
  id: string;
  vendor: string;
  vendorWalletId: string | null;
  scaAddress: string;
  counterfactual: boolean;
}): Promise<{ deployed: boolean; txHash?: string; error?: string }> {
  if (wallet.vendor !== "circle_modular" || !wallet.vendorWalletId) {
    return { deployed: !wallet.counterfactual };
  }
  if (!wallet.counterfactual) {
    return { deployed: true };
  }

  try {
    const code = await client.getCode({
      address: wallet.scaAddress as Address,
    });
    if (code && code !== "0x") {
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { counterfactual: false },
      });
      return { deployed: true };
    }
  } catch (error) {
    log.error("wallet", "Could not verify SCA deployment state on Arc", {
      walletId: wallet.id,
      error: error instanceof Error ? error.message : "RPC_CHECK_FAILED",
    });
  }

  const result = await deployCircleScaOnChain({
    vendorWalletId: wallet.vendorWalletId,
    scaAddress: wallet.scaAddress,
  });

  if (result.deployed) {
    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { counterfactual: false },
    });
    await prisma.auditLog.create({
      data: {
        action: "SCA_DEPLOYED",
        metadata: JSON.stringify({
          walletId: wallet.id,
          scaAddress: wallet.scaAddress,
          vendorWalletId: wallet.vendorWalletId,
          txHash: result.txHash,
          circleTxId: result.circleTxId,
        }),
      },
    });
    return { deployed: true, txHash: result.txHash };
  }

  log.error("wallet", "ensureCircleScaDeployed failed", {
    walletId: wallet.id,
    error: result.error,
  });
  return { deployed: false, error: result.error };
}

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

  // Prefer Circle SCA when credentials are configured; otherwise local Safe for dev.
  let scaAddress: string;
  let vendorWalletId: string | null = null;
  let ownerKeyRef: string | null = null;
  let ownerAddress: string | null = type === "wallet" ? normalized : null;
  let vendor = "circle_modular";

  // Circle SCAs start counterfactual until first on-chain deploy tx.
  let counterfactual = false;

  if (circleConfigured()) {
    const created = await createCircleScaWallet();
    scaAddress = created.address;
    vendorWalletId = created.walletId;
    vendor = "circle_modular";
    counterfactual = true;
  } else {
    const ownerPrivateKey = generatePrivateKey();
    const { account, ownerAddress: localOwner } =
      await createSmartAccountFromOwnerKey(ownerPrivateKey, client);
    scaAddress = account.address;
    ownerAddress = type === "wallet" ? normalized : localOwner;
    ownerKeyRef = encryptPrivateKey(
      ownerPrivateKey,
      config.walletEncryptionKey,
    );
    vendor = "safe_4337_v07";
    counterfactual = false;
  }

  const user = await prisma.user.create({
    data: {
      identities: {
        create: {
          type,
          normalizedValue: normalized,
          verifiedAt: new Date(),
        },
      },
      wallets: {
        create: {
          scaAddress,
          ownerAddress,
          vendorWalletId,
          ownerKeyRef,
          counterfactual,
          vendor,
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
        scaAddress,
        vendorWalletId,
        type,
        vendor,
        counterfactual,
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

export async function getWalletEurcBalanceMicro(scaAddress: Hex) {
  return getEurcBalanceMicro(client, scaAddress);
}

export async function getOwnerKeyForWallet(walletId: string): Promise<Hex> {
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
  });

  if (wallet.vendor === "circle_modular" || !wallet.ownerKeyRef) {
    throw new Error("OWNER_KEY_UNAVAILABLE – Circle-managed wallet");
  }

  const { decryptPrivateKey } = await import("../lib/crypto.js");
  return decryptPrivateKey(wallet.ownerKeyRef, config.walletEncryptionKey);
}
