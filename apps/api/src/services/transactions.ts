import { randomUUID } from "node:crypto";
import { getCircleClient } from "./circle.js";

/** Arc Testnet native USDC. */
const ARC_USDC = "0x3600000000000000000000000000000000000000";

const TERMINAL_FAILURE = new Set(["FAILED", "DENIED", "CANCELLED"]);

/**
 * Sends a USDC transfer using a Circle developer-controlled SCA.
 */
export async function sendCircleUsdcTransfer(params: {
  vendorWalletId: string;
  recipientAddress: string;
  amountMicro: bigint;
  /** Optional; generated if omitted. Must be unique per attempt. */
  idempotencyKey?: string;
}) {
  const client = getCircleClient();
  const idempotencyKey = params.idempotencyKey ?? randomUUID();

  const response = await client.createContractExecutionTransaction({
    walletId: params.vendorWalletId,
    contractAddress: ARC_USDC,
    abiFunctionSignature: "transfer(address,uint256)",
    abiParameters: [
      params.recipientAddress,
      params.amountMicro.toString(),
    ],
    fee: {
      type: "level",
      config: { feeLevel: "MEDIUM" },
    },
    idempotencyKey,
  });

  const txId = response.data?.id;
  if (!txId) {
    throw new Error(
      "Circle createContractExecutionTransaction failed – no transaction ID returned",
    );
  }

  return { circleTxId: txId, idempotencyKey };
}

/**
 * Polls a Circle transaction until it reaches a terminal state.
 */
export async function waitForCircleTransaction(circleTxId: string) {
  const client = getCircleClient();
  const maxAttempts = 45; // ~90s at 2s interval
  const intervalMs = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    const res = await client.getTransaction({ id: circleTxId });
    const tx = res.data as
      | { state?: string; txHash?: string; errorReason?: string }
      | undefined;

    if (!tx) {
      throw new Error("Circle transaction not found");
    }

    const state = tx.state ?? "";
    const txHash = tx.txHash;

    if (state === "COMPLETE") {
      if (!txHash) {
        throw new Error("Circle transaction COMPLETE but no txHash returned");
      }
      return {
        state: "COMPLETE" as const,
        txHash,
      };
    }

    if (TERMINAL_FAILURE.has(state)) {
      const reason = tx.errorReason ? `: ${tx.errorReason}` : "";
      throw new Error(`Circle transaction ${state}${reason}`);
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error("Circle transaction timed out");
}
