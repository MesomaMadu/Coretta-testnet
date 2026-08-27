import { randomUUID } from "node:crypto";
import { EURC_ADDRESS, USDC_ADDRESS } from "@coretta/shared";
import { getCircleClient } from "./circle.js";

const TERMINAL_FAILURE = new Set(["FAILED", "DENIED", "CANCELLED"]);

export interface CircleTransactionStatus {
  state: string;
  txHash?: string;
  errorReason?: string;
  errorDetails?: string;
}

export function arcTokenAddress(asset: "USDC" | "EURC") {
  return asset === "EURC" ? EURC_ADDRESS : USDC_ADDRESS;
}

/** Sends a six-decimal Arc stablecoin through a Circle developer-controlled SCA. */
export async function sendCircleTokenTransfer(params: {
  vendorWalletId: string;
  recipientAddress: string;
  amountMicro: bigint;
  asset: "USDC" | "EURC";
  /** Optional; generated if omitted. Must be unique per attempt. */
  idempotencyKey?: string;
}) {
  const client = getCircleClient();
  const idempotencyKey = params.idempotencyKey ?? randomUUID();

  const response = await client.createContractExecutionTransaction({
    walletId: params.vendorWalletId,
    contractAddress: arcTokenAddress(params.asset),
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
export async function getCircleTransactionStatus(
  circleTxId: string,
): Promise<CircleTransactionStatus> {
  const client = getCircleClient();
  const response = await client.getTransaction({ id: circleTxId });
  const transaction = response.data?.transaction as
    | {
        state?: string;
        txHash?: string;
        errorReason?: string;
        errorDetails?: string;
      }
    | undefined;
  if (!transaction) throw new Error("Circle transaction not found");
  return {
    state: transaction.state ?? "UNKNOWN",
    txHash: transaction.txHash,
    errorReason: transaction.errorReason,
    errorDetails: transaction.errorDetails,
  };
}

export async function waitForCircleTransaction(
  circleTxId: string,
  options?: { maxAttempts?: number; intervalMs?: number },
) {
  const maxAttempts = options?.maxAttempts ?? 300;
  const intervalMs = options?.intervalMs ?? 2000;

  for (let i = 0; i < maxAttempts; i++) {
    const tx = await getCircleTransactionStatus(circleTxId);
    const state = tx.state;
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
      const details = tx.errorDetails ? ` (${tx.errorDetails})` : "";
      throw new Error(`Circle transaction ${state}${reason}${details}`);
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error("Circle transaction timed out");
}
