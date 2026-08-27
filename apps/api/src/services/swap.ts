import { createRequire } from "node:module";
import type * as CircleAppKit from "@circle-fin/app-kit";
import type * as CircleWalletsAdapter from "@circle-fin/adapter-circle-wallets";
import { config } from "../config.js";
import { log } from "../lib/log.js";
import { trackUsageEvent } from "./limits.js";
import { createAuditEvent } from "./audit.js";
import { ARC_EXPLORER } from "@coretta/shared";
import { prisma } from "@coretta/db";

// Use the packages' CommonJS exports in Vercel's serverless runtime. Their ESM
// adapter path imports the dual-module developer-wallet SDK as native ESM,
// which Vercel currently externalizes without its named exports.
const circleRequire = createRequire(import.meta.url);
let circleSwapSdk:
  | {
      AppKit: typeof CircleAppKit.AppKit;
      createCircleWalletsAdapter: typeof CircleWalletsAdapter.createCircleWalletsAdapter;
    }
  | undefined;

function getCircleSwapSdk() {
  if (!circleSwapSdk) {
    const appKit = circleRequire("@circle-fin/app-kit") as typeof CircleAppKit;
    const walletsAdapter = circleRequire(
      "@circle-fin/adapter-circle-wallets",
    ) as typeof CircleWalletsAdapter;
    circleSwapSdk = {
      AppKit: appKit.AppKit,
      createCircleWalletsAdapter: walletsAdapter.createCircleWalletsAdapter,
    };
  }
  return circleSwapSdk;
}

export type SwapToken = "USDC" | "EURC" | "NATIVE" | "USDT";

export interface SwapRequest {
  userId: string;
  /** Circle developer-controlled wallet address used by the adapter (typically SCA). */
  walletAddress: string;
  tokenIn: SwapToken;
  tokenOut: SwapToken;
  amountIn: string;
  /** Optional bound EOA for usage metrics */
  eoaAddress?: string | null;
}

export interface SwapResultOk {
  ok: true;
  chain: "Arc_Testnet";
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut?: string;
  txHash?: string;
  explorerUrl?: string;
  message?: string;
}

export interface SwapResultBlocked {
  ok: false;
  code: string;
  message: string;
}

export type SwapServiceResult = SwapResultOk | SwapResultBlocked;

const ARC_CHAIN = "Arc_Testnet" as const;

/**
 * On Arc, USDC is the native gas token — USDC↔NATIVE is a no-op.
 */
export function isArcUsdcNativeNoop(tokenIn: string, tokenOut: string): boolean {
  const a = tokenIn.toUpperCase();
  const b = tokenOut.toUpperCase();
  const isUsdc = (t: string) => t === "USDC" || t === "0X3600000000000000000000000000000000000000";
  const isNative = (t: string) => t === "NATIVE";
  return (isUsdc(a) && isNative(b)) || (isNative(a) && isUsdc(b));
}

export async function executeTokenSwap(req: SwapRequest): Promise<SwapServiceResult> {
  if (isArcUsdcNativeNoop(req.tokenIn, req.tokenOut)) {
    return {
      ok: false,
      code: "ALREADY_GAS_TOKEN",
      message: "Already using network gas token.",
    };
  }

  if (req.tokenIn.toUpperCase() === req.tokenOut.toUpperCase()) {
    return {
      ok: false,
      code: "SAME_TOKEN",
      message: "Source and destination tokens are the same.",
    };
  }

  if (!config.kitKey) {
    log.swap("KIT_KEY missing");
    return {
      ok: false,
      code: "KIT_KEY_MISSING",
      message: "KIT_KEY is not configured on the server.",
    };
  }
  if (!config.circleApiKey || !config.circleEntitySecret) {
    log.swap("Circle credentials missing");
    return {
      ok: false,
      code: "CIRCLE_CONFIG_MISSING",
      message: "CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET are required for swaps.",
    };
  }

  const amount = req.amountIn.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) {
    return { ok: false, code: "INVALID_AMOUNT", message: "Invalid swap amount." };
  }

  try {
    const { AppKit, createCircleWalletsAdapter } = getCircleSwapSdk();
    const kit = new AppKit();
    const adapter = createCircleWalletsAdapter({
      apiKey: config.circleApiKey,
      entitySecret: config.circleEntitySecret,
    });

    log.info("swap", "Executing swap", {
      tokenIn: req.tokenIn,
      tokenOut: req.tokenOut,
      amountIn: amount,
      chain: ARC_CHAIN,
      wallet: `${req.walletAddress.slice(0, 6)}…${req.walletAddress.slice(-4)}`,
    });

    // Validate liquidity before asking the adapter to approve or execute anything.
    // The estimate is server-side and its fee details are intentionally not exposed
    // while Coretta sponsorship is active.
    const estimate = await kit.estimateSwap({
      from: {
        adapter,
        chain: ARC_CHAIN,
        address: req.walletAddress,
      },
      tokenIn: req.tokenIn,
      tokenOut: req.tokenOut,
      amountIn: amount,
      config: {
        kitKey: config.kitKey,
      },
    });

    const result = await kit.swap({
      from: {
        adapter,
        chain: ARC_CHAIN,
        address: req.walletAddress,
      },
      tokenIn: req.tokenIn,
      tokenOut: req.tokenOut,
      amountIn: amount,
      config: {
        kitKey: config.kitKey,
      },
    });

    const txHash =
      (result as { txHash?: string }).txHash ??
      (result as { transactionHash?: string }).transactionHash;

    // Prefer EOA for wallet-scoped usage (Usage dashboard queries by connected EOA).
    // Never fall back to SCA — that would write counters under a different key.
    const usageWallet = req.eoaAddress ?? null;
    await prisma.wallet.updateMany({
      where: {
        userId: req.userId,
        scaAddress: req.walletAddress,
        counterfactual: true,
      },
      data: { counterfactual: false },
    });
    await trackUsageEvent({
      walletAddress: usageWallet,
      userId: req.userId,
      key: "swapRequestCount",
    });
    // Gas on Arc is USDC-sponsored for chatbot swaps — count toward sponsorship quota.
    await trackUsageEvent({
      walletAddress: usageWallet,
      userId: req.userId,
      key: "sponsoredTxCount",
    });
    await createAuditEvent({
      actorId: req.userId,
      action: "SWAP_EXECUTED",
      metadata: {
        tokenIn: req.tokenIn,
        tokenOut: req.tokenOut,
        amountIn: amount,
        txHash,
        chain: ARC_CHAIN,
        usageWallet,
      },
    });

    return {
      ok: true,
      chain: ARC_CHAIN,
      tokenIn: req.tokenIn,
      tokenOut: req.tokenOut,
      amountIn: amount,
      amountOut: estimate.estimatedOutput.amount,
      txHash,
      explorerUrl: txHash ? `${ARC_EXPLORER}/tx/${txHash}` : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "SWAP_FAILED";
    const noRoute = /no route available|route or resource not found/i.test(message);
    const runtimeDependencyFailure =
      /ERR_REQUIRE_ESM|require\(\) of ES Module|rpc-websockets|uuid\/dist/i.test(
        message,
      );
    log.swap("Swap execution failed", { message });
    await createAuditEvent({
      actorId: req.userId,
      action: "SWAP_FAILED",
      metadata: {
        message,
        tokenIn: req.tokenIn,
        tokenOut: req.tokenOut,
        amountIn: amount,
      },
    });
    return {
      ok: false,
      code: noRoute
        ? "SWAP_ROUTE_UNAVAILABLE"
        : runtimeDependencyFailure
          ? "SWAP_SERVICE_UNAVAILABLE"
          : "SWAP_FAILED",
      message: noRoute
        ? `No ${req.tokenIn} to ${req.tokenOut} liquidity route is available on Arc Testnet right now. Try the reverse direction or retry later.`
        : runtimeDependencyFailure
          ? "The swap service is temporarily unavailable. Please retry shortly."
        : message.includes("wallet") || message.includes("not found")
          ? "Swap failed: wallet must be a Circle developer-controlled wallet on Arc Testnet. Local SCAs may not be eligible for App Kit swaps."
          : message,
    };
  }
}
