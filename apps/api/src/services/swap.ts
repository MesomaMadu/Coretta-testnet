import { AppKit } from "@circle-fin/app-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { config } from "../config.js";
import { log } from "../lib/log.js";
import { trackUsageEvent } from "./limits.js";
import { createAuditEvent } from "./audit.js";
import { ARC_EXPLORER } from "@arcremit/shared";

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

    await trackUsageEvent({
      walletAddress: req.eoaAddress ?? req.walletAddress,
      userId: req.userId,
      key: "swapRequestCount",
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
      },
    });

    return {
      ok: true,
      chain: ARC_CHAIN,
      tokenIn: req.tokenIn,
      tokenOut: req.tokenOut,
      amountIn: amount,
      amountOut: (result as { amountOut?: string }).amountOut,
      txHash,
      explorerUrl: txHash ? `${ARC_EXPLORER}/tx/${txHash}` : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "SWAP_FAILED";
    log.swap("Swap execution failed", { message });
    await createAuditEvent({
      actorId: req.userId,
      action: "SWAP_FAILED",
      metadata: { message, tokenIn: req.tokenIn, tokenOut: req.tokenOut },
    });
    return {
      ok: false,
      code: "SWAP_FAILED",
      message:
        message.includes("wallet") || message.includes("not found")
          ? "Swap failed: wallet must be a Circle developer-controlled wallet on Arc Testnet. Local SCAs may not be eligible for App Kit swaps."
          : message,
    };
  }
}
