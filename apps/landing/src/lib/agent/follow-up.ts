import type { ParseResult, TransactionDraft } from "./types";
import { validateAmountToken } from "./security";
import {
  accountWalletPlaceholderFromText,
  displayAccountWalletRecipient,
} from "./wallet-recipient";

export function isTransactionRetryRequest(input: string) {
  const text = input.trim().replace(/[.!?]+$/, "").replace(/^please\s+/i, "");
  return (
    /^(?:retry|re-?try|resend|re-?send|repeat|rerun|re-?run|resubmit|re-?submit|reprocess|re-?process)(?:\s+(?:(?:that|this|the|last|previous|failed)\s+)*(?:transaction|transfer|payment|swap|plan|request))?(?:\s+(?:again|now))?$/i.test(text) ||
    /^(?:try|run|send|submit|do|execute|process)\s+(?:(?:that|this|the|last|previous|failed)\s+)*(?:transaction|transfer|payment|swap|plan|request)?\s*again(?:\s+now)?$/i.test(text) ||
    /^(?:try|run|send|submit|do|execute|process)\s+(?:it|that|this)\s+again(?:\s+now)?$/i.test(text)
  );
}

function clarification(message: string): ParseResult {
  return { ok: false, reason: "ambiguous", requiresClarification: true, message };
}

export function isPendingBridgeRecipientAnswer(
  input: string,
  previous?: TransactionDraft | null,
) {
  if (
    (previous?.action !== "bridgeUSDC" && previous?.action !== "swapAndBridge") ||
    previous.recipient
  ) {
    return false;
  }
  const text = input.trim().replace(/[.!?]+$/, "").replace(/^please\s+/i, "");
  const accountRecipient = accountWalletPlaceholderFromText(text);
  const pendingBatch =
    Boolean(previous.batch?.length) &&
    previous.batch!.every((recipient) => !recipient.name);
  if (pendingBatch) return Boolean(accountRecipient);
  return Boolean(
    accountRecipient ?? text.match(/0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/)?.[0],
  );
}

/** Corrections only produce a new draft. They never authorize execution. */
export function parseTransactionFollowUp(
  input: string,
  previous?: TransactionDraft | null,
): ParseResult | null {
  const text = input.trim().replace(/[.!?]+$/, "").replace(/^please\s+/i, "");
  const retry = isTransactionRetryRequest(text);
  const equalSplit = /^(?:divide|split)\s+(?:(?:it|that|the\s+(?:output|proceeds))\s+)?(in\s+half|equally|evenly)(?:\s+(?:between|among|across)\s+(?:them|those\s+(?:addresses|wallets|recipients)))?(?:\s+and\s+(?:send|transfer)\s+(?:it|that|them))?(?:\s+then)?$/i.exec(text);
  const continuePlan = /^(?:(?:go\s+ahead\s+and\s+)?(?:proceed|continue)|send\s+it)(?:\s+(?:then|please))?$/i.test(text);
  const swapRevision = /^(?:swap|convert)\s+(\d+(?:\.\d+)?)\s*(USDC|EURC)\s+(?:to|into)\s+(USDC|EURC)\s+and\s+(?:proceed|continue)(?:\s+(?:then|please))?$/i.exec(text);
  const pendingBridgeRecipient =
    (previous?.action === "bridgeUSDC" || previous?.action === "swapAndBridge") &&
    !previous.recipient &&
    !previous.batch?.length;
  const pendingBridgeBatchRecipient =
    previous?.action === "bridgeUSDC" &&
    !previous.recipient &&
    Boolean(previous.batch?.length) &&
    previous.batch!.every((recipient) => !recipient.name);
  const accountBridgeRecipient = accountWalletPlaceholderFromText(text);
  const bridgeRecipient = pendingBridgeRecipient
    ? accountBridgeRecipient ??
      text.match(/0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/)?.[0] ??
      null
    : pendingBridgeBatchRecipient
      ? accountBridgeRecipient
    : null;
  if (!retry && !equalSplit && !continuePlan && !swapRevision && !bridgeRecipient) return null;

  // A complete, standalone swap remains valid without a pending recipient plan.
  if (swapRevision && previous?.action !== "swapAndSend") return null;
  if (!previous) {
    return clarification(
      retry
        ? "I don't have a failed transaction in this session that is safe to retry. Open Activity and name the failed transfer, or restate its amount, asset, and recipient."
        : "There isn't an unfinished plan to change. Tell me the amount, asset, and recipients so I can prepare a new preview.",
    );
  }

  const { receiveAmount: _output, quotedAt: _quotedAt, quoteStatus: _quoteStatus, ...draft } = previous;
  if (
    bridgeRecipient &&
    (draft.action === "bridgeUSDC" || draft.action === "swapAndBridge")
  ) {
    const recipientLabel = displayAccountWalletRecipient(bridgeRecipient);
    if (pendingBridgeBatchRecipient && draft.batch?.length) {
      const destinationLabels = [
        ...new Set(
          draft.batch.map(
            (recipient) =>
              recipient.destinationChainLabel ?? recipient.destinationChain,
          ),
        ),
      ];
      const chainCount = destinationLabels.length;
      return {
        ok: true,
        preview: {
          ...draft,
          recipient: `${chainCount} chains`,
          destinationChainLabel: `${chainCount} destination chains`,
          executionPath: `CCTP across ${chainCount} chains`,
          batch: draft.batch.map((recipient) => ({
            ...recipient,
            name: bridgeRecipient,
            displayAddress: recipientLabel,
            identityType: "address" as const,
          })),
          steps: [
            {
              id: "bridge-batch",
              label: `Bridge across ${chainCount} chains`,
              detail: `${draft.batch.length} locked CCTP transfers to ${recipientLabel}`,
              kind: "bridge",
            },
          ],
        },
      };
    }
    return {
      ok: true,
      preview: {
        ...draft,
        recipient: bridgeRecipient,
        steps: [
          ...(draft.action === "swapAndBridge"
            ? draft.steps.filter((step) => step.kind === "swap")
            : []),
          {
            id: "bridge",
            label: `Bridge USDC to ${draft.destinationChainLabel ?? draft.destinationChain}`,
            detail: `Mint to ${recipientLabel}`,
            kind: "bridge",
          },
        ],
      },
    };
  }
  if (retry) {
    const bridgeRecovery =
      draft.action === "bridgeUSDC" &&
      (draft.bridgeOperationId || draft.bridgeBatchId);
    return {
      ok: true,
      preview: {
        ...draft,
        ...(bridgeRecovery
          ? {
              steps: [
                {
                  id: "bridge-recovery",
                  label: draft.bridgeBatchId
                    ? `Resume failed CCTP legs to ${draft.destinationChainLabel ?? draft.destinationChain}`
                    : `Resume CCTP transfer to ${draft.destinationChainLabel ?? draft.destinationChain}`,
                  detail: draft.bridgeBatchId
                    ? "Retry only recoverable failed legs in the recorded batch"
                    : "Continue from the first incomplete CCTP step",
                  kind: "bridge" as const,
                },
              ],
              riskWarning:
                "This resumes the recorded CCTP operation. It does not burn the source USDC a second time.",
            }
          : {}),
        batch: draft.batch?.map((recipient) => ({ ...recipient })),
        estimatedBridgeFee: undefined,
      },
    };
  }
  if (equalSplit) {
    if (draft.action !== "swapAndSend" || !draft.batch || draft.batch.length < 2) {
      return clarification("Which recipients should share the swap output? List their addresses and I'll prepare an even split for review.");
    }
    if (/half/i.test(equalSplit[1]) && draft.batch.length !== 2) {
      return clarification(`There are ${draft.batch.length} recipients in this plan. Say “split it equally” to share the output among all of them, or name the two recipients who should receive half each.`);
    }
    return {
      ok: true,
      preview: {
        ...draft,
        allocation: "equal-output",
        totalAmount: undefined,
        batch: draft.batch.map((recipient) => ({ ...recipient, amount: "0" })),
      },
    };
  }

  if (swapRevision) {
    if (!validateAmountToken(swapRevision[1])) {
      return clarification("Use a positive swap amount with at most six decimal places, within the existing transaction limit.");
    }
    if (swapRevision[2].toUpperCase() !== draft.asset || swapRevision[3].toUpperCase() !== draft.receiveAsset) {
      return clarification("That changes the assets in the unfinished payment plan. State the new swap and recipient amounts together so I can prepare the correct preview.");
    }
    draft.amount = swapRevision[1];
  }

  return {
    ok: true,
    preview: {
      ...draft,
      ...(draft.allocation === "equal-output" ? { totalAmount: undefined } : {}),
      batch: draft.batch?.map((recipient) => ({ ...recipient })),
    },
  };
}
