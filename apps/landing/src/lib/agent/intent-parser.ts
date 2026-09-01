import type { AssetSymbol } from "@/lib/chains";
import type { AllowedAction, ParseResult, TransactionDraft } from "./types";
import {
  assessBatchRisk,
  parseBridgeBatchAllocation,
  parseMultiNetworkBridgePlan,
  parseMultiSend,
  parseQuotedOutputSplit,
  splitRecipients,
  type MultiNetworkBridgePlan,
} from "./multi-send";
import { detectPromptInjection, validateAmountToken } from "./security";
import {
  MAX_BATCH_RECIPIENTS,
  resolveCctpEvmTestnetDestination,
} from "@coretta/shared";
import { parseTransactionFollowUp } from "./follow-up";
import {
  accountWalletPlaceholderFromText,
  BOUND_MAIN_WALLET,
  BOUND_SMART_WALLET,
} from "./wallet-recipient";

function parseAmount(raw: string): string | null {
  const m = raw.match(/^(\d+(?:\.\d{1,6})?)$/);
  if (!m || !validateAmountToken(m[1])) return null;
  return m[1];
}

function parseRecipient(text: string): string | null {
  const accountWallet = accountWalletPlaceholderFromText(text);
  if (accountWallet) return accountWallet;
  // Prefer full EVM addresses (never treat 0x… as a name)
  const evm = text.match(/0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/i);
  if (evm) return evm[0];
  const email = text.match(/[\w.+-]+@[\w.-]+\.\w+/);
  if (email) return email[0];
  // Names only: letters first, no 0x prefix
  const toMatch = text.match(
    /(?:to|for)\s+([A-Za-z][A-Za-z0-9\s.'-]{0,40}?)(?:\s|$|\.|,)/i,
  );
  if (toMatch) {
    const name = toMatch[1].trim();
    // Guard: never accept a partial/broken hex as a name
    if (/^0x/i.test(name) || /\b0x[a-fA-F0-9]/i.test(name)) return null;
    return name;
  }
  return null;
}

function detectAsset(text: string): AssetSymbol | null {
  if (/\bEURC\b/i.test(text) || /€/.test(text)) return "EURC";
  if (/\bUSDC\b/i.test(text) || /\$/.test(text)) return "USDC";
  return null;
}

function sendSteps(asset: AssetSymbol, recipient: string, count = 1) {
  return [
    {
      id: "send",
      label: count > 1 ? `Send to ${count} recipients` : "Send payment",
      detail: `${asset} to ${recipient}`,
      kind: "send" as const,
    },
  ];
}

function swapSteps(from: AssetSymbol, to: AssetSymbol) {
  return [
    {
      id: "swap",
      label: `Swap ${from} to ${to}`,
      detail: "",
      kind: "swap" as const,
    },
  ];
}

function multiNetworkBridgeDraft(
  plan: MultiNetworkBridgePlan,
  options: { recipientPending?: boolean } = {},
): TransactionDraft {
  const destinationLabels = [
    ...new Set(
      plan.recipients.map(
        (recipient) => recipient.destinationChainLabel ?? recipient.destinationChain,
      ),
    ),
  ];
  const chainCount = destinationLabels.length;
  const batch = options.recipientPending
    ? plan.recipients.map((recipient) => ({
        ...recipient,
        name: "",
        displayAddress: undefined,
      }))
    : plan.recipients;
  return {
    action: "bridgeUSDC",
    recipient: options.recipientPending ? "" : `${chainCount} chains`,
    amount: plan.total,
    asset: "USDC",
    sponsorship: "user-paid",
    network: `Arc Testnet to ${destinationLabels.join(", ")}`,
    sourceChain: "Arc_Testnet",
    destinationChain: plan.destinationChains[0],
    destinationChainLabel: `${chainCount} destination chains`,
    executionPath: `CCTP across ${chainCount} chains`,
    batch,
    totalAmount: plan.total,
    allocation: plan.allocation,
    recipientCount: plan.recipients.length,
    steps: [
      {
        id: "bridge-batch",
        label: `Bridge across ${chainCount} chains`,
        detail: `${plan.recipients.length} locked CCTP transfers`,
        kind: "bridge",
      },
    ],
    riskWarning:
      assessBatchRisk(plan.recipients, plan.total) ??
      `Review all ${plan.recipients.length} amounts, wallets, and destination chains before confirming.`,
  };
}

function hasDuplicateRecipient(text: string) {
  const listed =
    text.match(/0x[a-fA-F0-9]{40}(?![a-fA-F0-9])|[\w.+-]+@[\w.-]+\.\w+/g) ?? [];
  if (listed.length >= 2) {
    const normalized = listed.map((identity) => identity.toLowerCase());
    if (new Set(normalized).size !== normalized.length) return true;
  }
  const explicit = [
    ...text.matchAll(
      /(\d+(?:\.\d{1,6})?)\s*(?:USDC|EURC)?\s+to\s+(0x[a-fA-F0-9]{40}(?![a-fA-F0-9])|[\w.+-]+@[\w.-]+\.\w+|[A-Za-z][\w.-]*)/gi,
    ),
  ].map((match) => match[2].toLowerCase());
  if (explicit.length >= 2) return new Set(explicit).size !== explicit.length;
  const equal = /\d+(?:\.\d{1,6})?\s*(?:USDC|EURC)?\s+to\s+(.+)/i.exec(text);
  if (!equal) return false;
  const recipients = splitRecipients(equal[1]).map((recipient) => recipient.toLowerCase());
  return recipients.length >= 2 && new Set(recipients).size !== recipients.length;
}

export function parseUserIntent(input: string, previous?: TransactionDraft | null): ParseResult {
  const injection = detectPromptInjection(input);
  if (injection) {
    return { ok: false, reason: "blocked", message: injection };
  }

  const text = input
    .trim()
    .replace(/^(?:(?:please|kindly|could\s+you|can\s+you(?:\s+please)?|would\s+you(?:\s+please)?|i\s+need\s+you\s+to)\s+)+/i, "");
  const lower = text.toLowerCase();

  if (/\bUSDT\b/i.test(text)) {
    return { ok: false, reason: "unsupported", requiresClarification: true, message: "Coretta supports USDC and EURC on Arc Testnet. Which of those assets would you like to use?" };
  }
  const followUp = parseTransactionFollowUp(text, previous);
  if (followUp) return followUp;

  const cctpDestination = resolveCctpEvmTestnetDestination(text);
  const swapLeg =
    /(?:convert|swap|exchange)\s+(\d+(?:\.\d{1,6})?)\s*(USDC|EURC)\s+(?:to|into|for)\s+(USDC|EURC)/i.exec(
      text,
    );
  const afterSwap = swapLeg
    ? text.slice((swapLeg.index ?? 0) + swapLeg[0].length)
    : "";
  const bridgeAfterSwap =
    /^[\s,]*(?:(?:and\s+then|then|and|after\s+that)\s+)?(?:bridge|move|route|transfer|send)\b/i.test(
      afterSwap,
    );
  const explicitlyCrossChainAfterSwap =
    /\b(?:bridge|cctp|cross[-\s]?chain)\b/i.test(afterSwap);
  if (
    swapLeg &&
    bridgeAfterSwap &&
    (Boolean(cctpDestination) || explicitlyCrossChainAfterSwap)
  ) {
    const amount = parseAmount(swapLeg[1]);
    const from = swapLeg[2].toUpperCase() as AssetSymbol;
    const to = swapLeg[3].toUpperCase() as AssetSymbol;
    if (!amount) {
      return {
        ok: false,
        reason: "ambiguous",
        requiresClarification: true,
        message: "How much should I swap first? Use a positive amount up to 100 with no more than six decimals.",
      };
    }
    if (from === to) {
      return {
        ok: false,
        reason: "ambiguous",
        requiresClarification: true,
        message: "The swap needs two different assets.",
      };
    }
    if (to !== "USDC") {
      return {
        ok: false,
        reason: "unsupported",
        requiresClarification: true,
        message: "CCTP can bridge the USDC produced by the swap. Change the swap output to USDC.",
      };
    }
    const explicitBridgeAmount = afterSwap.match(
      /(?:bridge|move|route|transfer|send)\s+(\d+(?:\.\d{1,6})?)\s*(USDC|EURC)\b/i,
    );
    const usesSwapOutput =
      /(?:bridge|move|route|transfer|send)\s+(?:it|that|all(?:\s+of\s+it)?|the\s+(?:quoted\s+)?(?:output|proceeds))\b/i.test(
        afterSwap,
      );
    if (explicitBridgeAmount?.[2].toUpperCase() !== "USDC" && explicitBridgeAmount) {
      return {
        ok: false,
        reason: "ambiguous",
        requiresClarification: true,
        message: "The bridge leg must use USDC, which is the asset produced by this swap.",
      };
    }
    const bridgeAmount = explicitBridgeAmount
      ? parseAmount(explicitBridgeAmount[1])
      : null;
    if (explicitBridgeAmount && !bridgeAmount) {
      return {
        ok: false,
        reason: "ambiguous",
        requiresClarification: true,
        message: "Use a positive USDC bridge amount up to 100 with no more than six decimals.",
      };
    }
    if (!bridgeAmount && !usesSwapOutput) {
      return {
        ok: false,
        reason: "ambiguous",
        requiresClarification: true,
        message: "How much of the swapped USDC should I bridge? State an exact amount or say “bridge the output.”",
      };
    }
    if (!cctpDestination) {
      return {
        ok: false,
        reason: "ambiguous",
        requiresClarification: true,
        message: "Which supported EVM testnet should receive the USDC? For example, Base Sepolia or Arbitrum Sepolia.",
      };
    }
    const parsedRecipient = parseRecipient(afterSwap);
    const recipient =
      parsedRecipient &&
      (/^0x[a-fA-F0-9]{40}$/.test(parsedRecipient) ||
        parsedRecipient === BOUND_MAIN_WALLET ||
        parsedRecipient === BOUND_SMART_WALLET)
        ? parsedRecipient
        : null;
    const draft: TransactionDraft = {
      action: "swapAndBridge",
      recipient: recipient ?? "",
      amount,
      asset: from,
      receiveAsset: "USDC",
      swapRoute: `${from} to USDC`,
      sponsorship: "user-paid",
      network: `Arc Testnet to ${cctpDestination.label}`,
      sourceChain: "Arc_Testnet",
      destinationChain: cctpDestination.id,
      destinationChainLabel: cctpDestination.label,
      executionPath: `Swap on Arc Testnet, then CCTP to ${cctpDestination.label}`,
      ...(bridgeAmount ? { totalAmount: bridgeAmount } : {}),
      recipientCount: 1,
      steps: [
        ...swapSteps(from, "USDC"),
        {
          id: "bridge",
          label: `Bridge USDC to ${cctpDestination.label}`,
          detail: recipient ? `Mint to ${recipient}` : "Recipient required",
          kind: "bridge",
        },
      ],
      riskWarning:
        "The swap can settle before the CCTP transfer completes. Review the swap amount, bridge amount, destination chain, and recipient before confirming.",
    };
    if (!recipient) {
      return {
        ok: false,
        reason: "ambiguous",
        requiresClarification: true,
        message: `Who should receive the USDC on ${cctpDestination.label}? Paste a full EVM address, say “my wallet” for your Coretta smart wallet, or say “my linked wallet” for your verified external wallet.`,
        draft,
      };
    }
    return { ok: true, preview: draft };
  }
  const bridgeLanguage =
    /\b(?:bridge|cctp|cross[-\s]?chain)\b/i.test(text) ||
    (Boolean(cctpDestination) &&
      /\b(?:send|transfer|move|route|forward|distribute|split|divide|share|spread|allocate|pay|remit)\b/i.test(text) &&
      /\b(?:from\s+arc|to|into|onto|on)\b/i.test(text));
  if (bridgeLanguage) {
    const amountToken = text.match(/(\d+(?:\.\d{1,6})?)\s*(USDC|EURC)\b/i);
    if (/\d+(?:\.\d{1,6})?\s*EURC\b/i.test(text)) {
      return {
        ok: false,
        reason: "unsupported",
        requiresClarification: true,
        message: "CCTP carries USDC. Swap EURC to USDC first, then state the destination EVM testnet and wallet address.",
      };
    }
    const amount = amountToken ? parseAmount(amountToken[1]) : null;
    if (!amount) {
      return {
        ok: false,
        reason: "ambiguous",
        requiresClarification: true,
        message: "How much USDC should I bridge? Use an amount up to 100 USDC.",
      };
    }
    const multiNetwork = parseMultiNetworkBridgePlan(text);
    if (multiNetwork) {
      if (!multiNetwork.ok) {
        const pendingRecipientPlan = /Which wallet should receive USDC on each chain/i.test(
          multiNetwork.message,
        )
          ? parseMultiNetworkBridgePlan(`${text} to my wallet`)
          : null;
        return {
          ok: false,
          reason: "ambiguous",
          requiresClarification: true,
          message: multiNetwork.message,
          ...(pendingRecipientPlan?.ok
            ? {
                draft: multiNetworkBridgeDraft(pendingRecipientPlan.plan, {
                  recipientPending: true,
                }),
              }
            : {}),
        };
      }
      return {
        ok: true,
        preview: multiNetworkBridgeDraft(multiNetwork.plan),
      };
    }
    if (!cctpDestination) {
      return {
        ok: false,
        reason: "ambiguous",
        requiresClarification: true,
        message: "Which supported EVM testnet should receive the USDC? For example, Base Sepolia or Arbitrum Sepolia.",
      };
    }
    const bridgeAddresses =
      text.match(/0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/g) ?? [];
    if (bridgeAddresses.length > MAX_BATCH_RECIPIENTS) {
      return {
        ok: false,
        reason: "ambiguous",
        requiresClarification: true,
        message: `A single bridge plan supports up to ${MAX_BATCH_RECIPIENTS} recipients. Split this request into separate plans.`,
      };
    }
    const normalizedBridgeAddresses = bridgeAddresses.map((address) => address.toLowerCase());
    if (new Set(normalizedBridgeAddresses).size !== normalizedBridgeAddresses.length) {
      return {
        ok: false,
        reason: "ambiguous",
        requiresClarification: true,
        message: "One destination wallet appears more than once. Remove the duplicate before I prepare the bridge plan.",
      };
    }
    if (bridgeAddresses.length >= 2) {
      const batchAllocation = parseBridgeBatchAllocation(text, bridgeAddresses);
      if (!batchAllocation) {
        return {
          ok: false,
          reason: "ambiguous",
          requiresClarification: true,
          message:
            `I found ${bridgeAddresses.length} wallets, but the allocation is unclear. Say either “split 20 USDC equally among these wallets,” “send 2 USDC to each wallet,” or state an amount for every wallet.`,
        };
      }
      return {
        ok: true,
        preview: {
          action: "bridgeUSDC",
          recipient: `${batchAllocation.recipients.length} wallets`,
          amount: batchAllocation.total,
          asset: "USDC",
          sponsorship: "user-paid",
          network: `Arc Testnet → ${cctpDestination.label}`,
          sourceChain: "Arc_Testnet",
          destinationChain: cctpDestination.id,
          destinationChainLabel: cctpDestination.label,
          executionPath: `CCTP batch → ${cctpDestination.label}`,
          batch: batchAllocation.recipients,
          totalAmount: batchAllocation.total,
          allocation: batchAllocation.allocation,
          recipientCount: batchAllocation.recipients.length,
          steps: [
            {
              id: "bridge-batch",
              label: `Bridge to ${batchAllocation.recipients.length} recipients`,
              detail: `${batchAllocation.total} USDC across independent CCTP legs`,
              kind: "bridge",
            },
          ],
          riskWarning:
            assessBatchRisk(batchAllocation.recipients, batchAllocation.total) ??
            `This creates ${batchAllocation.recipients.length} independent cross-chain transfers. Review every amount, wallet, and the ${cctpDestination.label} network before confirming.`,
        },
      };
    }
    const parsedBridgeRecipient = parseRecipient(text);
    const recipient =
      parsedBridgeRecipient &&
      (/^0x[a-fA-F0-9]{40}$/.test(parsedBridgeRecipient) ||
        parsedBridgeRecipient === BOUND_MAIN_WALLET ||
        parsedBridgeRecipient === BOUND_SMART_WALLET)
        ? parsedBridgeRecipient
        : null;
    if (!recipient) {
      const draft: TransactionDraft = {
        action: "bridgeUSDC",
        recipient: "",
        amount,
        asset: "USDC",
        sponsorship: "user-paid",
        network: `Arc Testnet to ${cctpDestination.label}`,
        sourceChain: "Arc_Testnet",
        destinationChain: cctpDestination.id,
        destinationChainLabel: cctpDestination.label,
        executionPath: `CCTP to ${cctpDestination.label}`,
        steps: [
          {
            id: "bridge",
            label: `Bridge USDC to ${cctpDestination.label}`,
            detail: "Recipient required",
            kind: "bridge",
          },
        ],
        riskWarning:
          "Check every destination network and recipient before confirming.",
      };
      return {
        ok: false,
        reason: "ambiguous",
        requiresClarification: true,
        message: `Which EVM wallet should receive the USDC on ${cctpDestination.label}? Paste its full address, say “my wallet” for your Coretta smart wallet, or say “my linked wallet” for your verified external wallet.`,
        draft,
      };
    }
    return {
      ok: true,
      preview: {
        action: "bridgeUSDC",
        recipient,
        amount,
        asset: "USDC",
        sponsorship: "user-paid",
        network: `Arc Testnet → ${cctpDestination.label}`,
        sourceChain: "Arc_Testnet",
        destinationChain: cctpDestination.id,
        destinationChainLabel: cctpDestination.label,
        executionPath: `CCTP → ${cctpDestination.label}`,
        steps: [
          {
            id: "bridge",
            label: `Bridge USDC to ${cctpDestination.label}`,
            detail: `Mint to ${recipient}`,
            kind: "bridge",
          },
        ],
        riskWarning:
          "This is a cross-chain transfer. Check the destination network and recipient before confirming.",
      },
    };
  }

  if (text.length < 3) {
    return {
      ok: false,
      reason: "ambiguous",
      message: "Tell me who to pay and how much, for example: “Send 50 USDC to Sarah.”",
    };
  }

  const swapAndSend =
    /(?:convert|swap|exchange)\s+(\d+(?:\.\d{1,6})?)\s*(USDC|EURC)\s+(?:to|into|for)\s+(USDC|EURC)\s+and\s+(?:send|pay|transfer|remit|split|divide|distribute)\s+(.+)/i.exec(text);
  if (swapAndSend) {
    const amount = parseAmount(swapAndSend[1]);
    const from = swapAndSend[2].toUpperCase() as AssetSymbol;
    const to = swapAndSend[3].toUpperCase() as AssetSymbol;
    const sendTail = swapAndSend[4].trim();
    const listedRecipients = splitRecipients(sendTail);
    if (listedRecipients.length > MAX_BATCH_RECIPIENTS) {
      return {
        ok: false,
        reason: "ambiguous",
        message: `A single plan supports up to ${MAX_BATCH_RECIPIENTS} recipients. Split this request into separate plans.`,
      };
    }
    if (hasDuplicateRecipient(sendTail)) {
      return {
        ok: false,
        reason: "ambiguous",
        message: "A recipient appears more than once. Combine their amount into one payment leg.",
      };
    }
    if (!amount) {
      return { ok: false, reason: "ambiguous", message: "What amount would you like to convert? (Max $100 per transfer.)" };
    }
    if (from === to) {
      return { ok: false, reason: "ambiguous", message: "Source and destination assets must differ." };
    }
    const quotedSplit = parseQuotedOutputSplit(sendTail, to);
    const multi = quotedSplit ? null : parseMultiSend(`send ${sendTail}`, to);
    let batch = quotedSplit?.recipients ?? multi?.recipients;
    let totalAmount = multi?.total;
    let recipient = batch ? `${batch.length} wallets` : null;
    let useQuotedOutput = Boolean(quotedSplit);
    if (!batch) {
      const single = /(\d+(?:\.\d{1,6})?)\s*(USDC|EURC)?\s*(?:to|for)\s+(.+)/i.exec(sendTail);
      const sendAmount = single ? parseAmount(single[1]) : null;
      const requestedAsset = single?.[2]?.toUpperCase() as AssetSymbol | undefined;
      if (requestedAsset && requestedAsset !== to) {
        return {
          ok: false,
          reason: "ambiguous",
          message: `The send leg must use ${to}, the asset produced by the swap.`,
        };
      }
      if (single) {
        const recipientText = single[3].trim();
        recipient =
          parseRecipient(`to ${recipientText}`) ??
          (!/^0x/i.test(recipientText) && !recipientText.includes("0x") ? recipientText : null);
      }
      totalAmount = sendAmount ?? undefined;
      if (!single) {
        const quotedOutputRecipient = /^(?:(?:all(?:\s+of\s+it)?|it|the\s+(?:quoted\s+)?(?:output|proceeds))\s+)?(?:to|for)\s+(.+)$/i.exec(
          sendTail,
        );
        if (quotedOutputRecipient) {
          const recipientText = quotedOutputRecipient[1].trim().replace(/[.!?]$/, "");
          recipient =
            parseRecipient(`to ${recipientText}`) ??
            (!/^0x/i.test(recipientText) && !recipientText.includes("0x") ? recipientText : null);
          useQuotedOutput = true;
        }
      }
    }
    if (!recipient || (!totalAmount && !useQuotedOutput)) {
      return {
        ok: false,
        reason: "ambiguous",
        message: `State the exact ${to} amount and recipient after the swap, for example: “Convert 100 ${from} to ${to} and send 50 ${to} to alex@example.com.”`,
      };
    }
    return {
      ok: true,
      preview: {
        action: "swapAndSend",
        recipient,
        amount,
        asset: from,
        receiveAsset: to,
        swapRoute: `${from} → ${to}`,
        sponsorship: "sponsored",
        network: "Arc Testnet",
        executionPath: "Swap → recipient payment",
        batch,
        ...(totalAmount ? { totalAmount } : {}),
        ...(quotedSplit ? { allocation: "equal-output" as const } : {}),
        recipientCount: batch?.length ?? 1,
        steps: [
          ...swapSteps(from, to).slice(0, 1),
          ...sendSteps(to, recipient, batch?.length ?? 1),
        ],
        riskWarning:
          (batch && assessBatchRisk(batch, totalAmount ?? amount)) ??
          "The swap can settle before a later payment leg fails or waits for recipient approval. Review every leg before confirming.",
      },
    };
  }

  // Arc: USDC is gas — reject USDC↔native phrasing early
  if (/\b(swap|convert)\b/i.test(text) && /\bnative\b/i.test(text) && /\bUSDC\b/i.test(text)) {
    return {
      ok: false,
      reason: "blocked",
      message: "Already using network gas token.",
    };
  }

  const swapOnly = /(?:swap|convert|exchange)\s+(\d+(?:\.\d+)?)\s*(USDC|EURC)\s+(?:to|into|for)\s+(USDC|EURC)/i.exec(text);
  if (swapOnly) {
    const amount = parseAmount(swapOnly[1]);
    const from = swapOnly[2].toUpperCase() as AssetSymbol;
    const to = swapOnly[3].toUpperCase() as AssetSymbol;
    if (!amount) {
      return { ok: false, reason: "ambiguous", message: "How much would you like to swap?" };
    }
    if (from === to) {
      return {
        ok: false,
        reason: "ambiguous",
        message: "Source and destination assets are the same. Pick different assets to swap.",
      };
    }
    const action: AllowedAction =
      from === "USDC" ? "swapUSDCtoEURC" : "swapEURCtoUSDC";
    return {
      ok: true,
      preview: {
        action,
        recipient: "Your wallet",
        amount,
        asset: from,
        receiveAsset: to,
        swapRoute: `${from} → ${to}`,
        sponsorship: "sponsored",
        network: "Arc Testnet",
        executionPath: "Swap on Arc Testnet",
        steps: swapSteps(from, to),
      },
    };
  }

  const defaultAsset = detectAsset(text) ?? "USDC";
  const listedRecipients = splitRecipients(text);
  if (
    /\b(?:send|transfer)\b/i.test(text) &&
    listedRecipients.length > MAX_BATCH_RECIPIENTS
  ) {
    return {
      ok: false,
      reason: "ambiguous",
      message: `A single plan supports up to ${MAX_BATCH_RECIPIENTS} recipients. Split this request into separate plans.`,
    };
  }
  const multi = parseMultiSend(text, defaultAsset);
  if (multi && multi.recipients.length >= 2) {
    const normalizedRecipients = multi.recipients.map((recipient) => recipient.name.toLowerCase());
    if (new Set(normalizedRecipients).size !== normalizedRecipients.length) {
      return {
        ok: false,
        reason: "ambiguous",
        message: "A recipient appears more than once. Combine their amount into one payment leg.",
      };
    }
    const action: AllowedAction = multi.asset === "USDC" ? "sendUSDC" : "sendEURC";
    const n = multi.recipients.length;
    const summary = multi.recipients
      .map((r) => {
        if (r.identityType === "address") {
          return `${r.amount} ${multi.asset} → ${r.name.slice(0, 6)}…${r.name.slice(-4)}`;
        }
        return `${r.amount} ${multi.asset} → ${r.name}`;
      })
      .join("; ");
    const riskWarning = assessBatchRisk(multi.recipients, multi.total);
    return {
      ok: true,
      preview: {
        action,
        recipient: `${n} wallet${n === 1 ? "" : "s"}`,
        amount: multi.total,
        asset: multi.asset,
        batch: multi.recipients,
        totalAmount: multi.total,
        recipientCount: n,
        riskWarning,
        sponsorship: "sponsored",
        network: "Arc Testnet",
        executionPath: `Batch → ${n} wallets · ${summary}`,
        steps: sendSteps(multi.asset, `${n} recipients`, n),
      },
    };
  }

  const recipientFirstSend =
    /(?:send|transfer|pay|remit|forward)\s+(.+?)\s+(?:another\s+)?(\d+(?:\.\d+)?)\s*(USDC|EURC)\b/i.exec(
      text,
    );
  if (recipientFirstSend) {
    const recipientText = recipientFirstSend[1]?.trim().replace(/[.!?]$/, "") ?? "";
    const amount = parseAmount(recipientFirstSend[2]);
    const asset = recipientFirstSend[3].toUpperCase() as AssetSymbol;
    const evm = recipientText.match(/0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/i)?.[0];
    const email = recipientText.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0];
    const recipient =
      evm ||
      email ||
      parseRecipient(`to ${recipientText}`) ||
      (!/^0x/i.test(recipientText) && !recipientText.includes("0x") ? recipientText : null);

    if (!amount) {
      return { ok: false, reason: "ambiguous", message: "What amount should I send? (Max $100.)" };
    }
    if (!recipient) {
      return {
        ok: false,
        reason: "ambiguous",
        message: "Who is the recipient? Use a full EVM address, email, or saved name.",
      };
    }

    return {
      ok: true,
      preview: {
        action: asset === "USDC" ? "sendUSDC" : "sendEURC",
        recipient,
        amount,
        asset,
        sponsorship: "sponsored",
        network: "Arc Testnet",
        executionPath: "Smart wallet -> Paymaster -> Bundler -> Arc",
        steps: sendSteps(asset, recipient),
      },
    };
  }

  const sendMatch =
    /(?:send|transfer|pay|remit|forward)\s+(\d+(?:\.\d+)?)\s*(USDC|EURC)?\s*(?:to|for)\s+(.+)/i.exec(text);
  if (sendMatch) {
    const amount = parseAmount(sendMatch[1]);
    let asset = (sendMatch[2]?.toUpperCase() as AssetSymbol) || detectAsset(text);
    const tail = sendMatch[3]?.trim().replace(/[.!?]$/, "") ?? "";
    // Prefer a full address/email in the tail; do not treat hex as a name.
    const evmInTail = tail.match(/0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/i);
    const emailInTail = tail.match(/[\w.+-]+@[\w.-]+\.\w+/);
    const recipient =
      (evmInTail ? evmInTail[0] : null) ||
      (emailInTail ? emailInTail[0] : null) ||
      parseRecipient(text) ||
      // Only fall back to free-text tail if it is clearly a name (no 0x)
      (!/^0x/i.test(tail) && !tail.includes("0x") ? tail : null);
    if (!amount) {
      return { ok: false, reason: "ambiguous", message: "What amount should I send? (Max $100.)" };
    }
    if (!asset) {
      return {
        ok: false,
        reason: "ambiguous",
        message: "Which asset should I send, USDC or EURC?",
      };
    }
    if (!recipient) {
      return {
        ok: false,
        reason: "ambiguous",
        message:
          "Who is the recipient? Use a full EVM address (0x…), email, or name.",
      };
    }
    const action: AllowedAction = asset === "USDC" ? "sendUSDC" : "sendEURC";
    return {
      ok: true,
      preview: {
        action,
        recipient,
        amount,
        asset,
        sponsorship: "sponsored",
        network: "Arc Testnet",
        executionPath: "Smart wallet → Paymaster → Bundler → Arc",
        steps: sendSteps(asset, recipient),
      },
    };
  }

  const euroSend = /send\s+€\s*(\d+(?:\.\d+)?)\s*(?:to|for)\s+(.+)/i.exec(text);
  if (euroSend) {
    const amount = parseAmount(euroSend[1]);
    const recipient = euroSend[2]?.trim();
    if (!amount || !recipient) {
      return { ok: false, reason: "ambiguous", message: "Please specify amount and recipient for your EURC transfer." };
    }
    return {
      ok: true,
      preview: {
        action: "sendEURC",
        recipient,
        amount,
        asset: "EURC",
        sponsorship: "sponsored",
        network: "Arc Testnet",
        executionPath: "Smart wallet → Paymaster → Bundler → Arc",
        steps: sendSteps("EURC", recipient),
      },
    };
  }

  if (lower.includes("help") || lower.includes("what can")) {
    return {
      ok: false,
      reason: "unsupported",
      message:
        "I can help you send USDC or EURC, or swap between them. Try: “Send 50 USDC to david@email.com” or “Convert 100 USDC to EURC and send to Sarah.”",
    };
  }

  return {
    ok: false,
    reason: "ambiguous",
    message:
      "I need a clear instruction. Example: “Send 25 USDC to Alex” or “Swap 50 USDC to EURC.”",
  };
}
