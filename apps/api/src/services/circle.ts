import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type * as CircleDeveloperWallets from "@circle-fin/developer-controlled-wallets";
import {
  USDC_ADDRESS,
  type CctpEvmTestnetChainId,
} from "@coretta/shared";
import { config } from "../config.js";
import { log } from "../lib/log.js";

// Vercel externalizes this dual ESM/CommonJS SDK. Loading its CommonJS export
// avoids a native ESM named-export mismatch in the serverless runtime.
const circleDeveloperWallets = createRequire(import.meta.url)(
  "@circle-fin/developer-controlled-wallets",
) as typeof CircleDeveloperWallets;
const { initiateDeveloperControlledWalletsClient } = circleDeveloperWallets;

const CIRCLE_SCA_DESTINATION_BLOCKCHAINS = {
  Arbitrum_Sepolia: "ARB-SEPOLIA",
  Avalanche_Fuji: "AVAX-FUJI",
  Base_Sepolia: "BASE-SEPOLIA",
  Ethereum_Sepolia: "ETH-SEPOLIA",
  Monad_Testnet: "MONAD-TESTNET",
  Optimism_Sepolia: "OP-SEPOLIA",
  Polygon_Amoy_Testnet: "MATIC-AMOY",
  Unichain_Sepolia: "UNI-SEPOLIA",
} satisfies Partial<
  Record<CctpEvmTestnetChainId, CircleDeveloperWallets.EvmBlockchain>
>;

export function circleScaBlockchainForCctpDestination(
  destinationChain: CctpEvmTestnetChainId,
): CircleDeveloperWallets.EvmBlockchain | null {
  return CIRCLE_SCA_DESTINATION_BLOCKCHAINS[
    destinationChain as keyof typeof CIRCLE_SCA_DESTINATION_BLOCKCHAINS
  ] ?? null;
}

export function isCircleScaCctpDestination(
  destinationChain: CctpEvmTestnetChainId,
) {
  return circleScaBlockchainForCctpDestination(destinationChain) !== null;
}

export function getCircleClient() {
  if (!config.circleApiKey || !config.circleEntitySecret) {
    throw new Error("CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET required");
  }
  return initiateDeveloperControlledWalletsClient({
    apiKey: config.circleApiKey,
    entitySecret: config.circleEntitySecret,
  });
}

/**
 * Creates a new SCA under the existing Wallet Set.
 * Returns the Circle wallet UUID and the on-chain address.
 * SCA is counterfactual until the first on-chain tx deploys it.
 */
export async function createCircleScaWallet() {
  const client = getCircleClient();
  const walletSetId = config.circleWalletSetId;
  if (!walletSetId) throw new Error("CIRCLE_WALLET_SET_ID required");

  const res = await client.createWallets({
    walletSetId,
    blockchains: ["ARC-TESTNET"],
    count: 1,
    accountType: "SCA",
    idempotencyKey: randomUUID(),
  });

  const w = res.data?.wallets?.[0];
  if (!w?.id || !w.address) {
    throw new Error("Circle createWallets returned no wallet");
  }
  return { walletId: w.id, address: w.address as `0x${string}` };
}

/**
 * Derives the existing Arc SCA onto a supported destination EVM testnet.
 * Circle returns the same address on the target chain and treats repeats as
 * an update of the already-derived wallet.
 */
export async function ensureCircleScaDestination(params: {
  vendorWalletId: string;
  scaAddress: string;
  destinationChain: CctpEvmTestnetChainId;
}) {
  const blockchain = circleScaBlockchainForCctpDestination(
    params.destinationChain,
  );
  if (!blockchain) throw new Error("CIRCLE_SCA_DESTINATION_UNAVAILABLE");

  const response = await getCircleClient().deriveWallet({
    id: params.vendorWalletId,
    blockchain,
  });
  const wallet = response.data?.wallet;
  if (!wallet?.id || !wallet.address) {
    throw new Error("CIRCLE_SCA_DERIVATION_EMPTY");
  }
  if (wallet.address.toLowerCase() !== params.scaAddress.toLowerCase()) {
    throw new Error("CIRCLE_SCA_DERIVATION_ADDRESS_MISMATCH");
  }
  log.info("circle", "Derived Coretta SCA on CCTP destination", {
    destinationChain: params.destinationChain,
    blockchain,
    address: `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`,
  });
  return {
    walletId: wallet.id,
    address: wallet.address,
    blockchain,
  };
}

/**
 * Deploy a Circle SCA on-chain by executing a zero-amount USDC self-transfer.
 * Circle SCAs stay undeployed until the first outbound contract/tx execution.
 * Requires the wallet to hold enough USDC for Arc gas (gas asset is USDC).
 */
export async function deployCircleScaOnChain(params: {
  vendorWalletId: string;
  scaAddress: string;
}): Promise<{ deployed: boolean; circleTxId?: string; txHash?: string; error?: string }> {
  const client = getCircleClient();
  const sca = params.scaAddress as `0x${string}`;

  try {
    const response = await client.createContractExecutionTransaction({
      walletId: params.vendorWalletId,
      contractAddress: USDC_ADDRESS,
      abiFunctionSignature: "transfer(address,uint256)",
      // 0 USDC to self — still deploys the SCA account when gas is available
      abiParameters: [sca, "0"],
      fee: {
        type: "level",
        config: { feeLevel: "MEDIUM" },
      },
      idempotencyKey: randomUUID(),
    });

    const circleTxId = response.data?.id;
    if (!circleTxId) {
      return { deployed: false, error: "Circle deploy tx returned no id" };
    }

    // Poll until terminal (same lifecycle as remits)
    for (let i = 0; i < 90; i++) {
      const res = await client.getTransaction({ id: circleTxId });
      const tx = res.data?.transaction as
        | { state?: string; txHash?: string; errorReason?: string }
        | undefined;
      if (!tx) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      const state = tx.state ?? "";
      if (i % 5 === 0) {
        log.info("circle", "SCA deploy poll", {
          circleTxId,
          attempt: i + 1,
          state,
          txHash: tx.txHash,
        });
      }
      if (state === "COMPLETE") {
        return {
          deployed: true,
          circleTxId,
          txHash: tx.txHash,
        };
      }
      if (state === "FAILED" || state === "DENIED" || state === "CANCELLED") {
        return {
          deployed: false,
          circleTxId,
          error: tx.errorReason
            ? `Circle deploy ${state}: ${tx.errorReason}`
            : `Circle deploy ${state}`,
        };
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    return {
      deployed: false,
      circleTxId,
      error: "Circle deploy transaction timed out",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("circle", "SCA deploy failed", {
      vendorWalletId: params.vendorWalletId,
      sca: `${sca.slice(0, 8)}…`,
      message,
    });
    return { deployed: false, error: message };
  }
}
