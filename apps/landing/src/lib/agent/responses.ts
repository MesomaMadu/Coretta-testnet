export type DamianResponseLength = "brief" | "standard" | "detailed";

export type DamianHistoryItem = {
  id: string;
  direction?: "sent" | "received";
  amount: string;
  asset: string;
  state: string;
  destinationAddress: string | null;
  counterpartyAddress?: string | null;
  txHash?: string | null;
  failureReason?: string | null;
  createdAt: string;
  settledAt?: string | null;
};

type TransactionFacts = {
  action?: "sendUSDC" | "sendEURC" | "swapUSDCtoEURC" | "swapEURCtoUSDC" | "swapAndSend" | "swapAndBridge" | "bridgeUSDC";
  receiveAsset?: string;
  operationId?: string;
  amount?: string;
  asset?: string;
  recipient?: string;
  network?: string;
  txHash?: string;
  reason?: string;
  stepCount?: number;
  details?: string[];
  settledCount?: number;
  pendingCount?: number;
  failedCount?: number;
  totalCount?: number;
};

export type DamianResponseRequest =
  | { event: "transaction_preparing"; facts: TransactionFacts }
  | { event: "preview_ready"; facts: TransactionFacts & { details: string[] } }
  | { event: "transaction_processing"; facts: TransactionFacts }
  | { event: "transaction_delayed"; facts: TransactionFacts }
  | { event: "recipient_approval_pending"; facts: TransactionFacts }
  | { event: "transaction_pending"; facts: TransactionFacts }
  | { event: "transaction_settled"; facts: TransactionFacts }
  | { event: "transaction_partial"; facts: TransactionFacts }
  | { event: "transaction_failed"; facts: TransactionFacts }
  | { event: "preview_cancelled"; facts?: TransactionFacts }
  | { event: "transaction_busy"; facts?: TransactionFacts }
  | { event: "history_permission_required"; facts?: TransactionFacts }
  | { event: "history_empty"; facts?: TransactionFacts }
  | { event: "history_unavailable"; facts?: TransactionFacts }
  | { event: "history_list"; items: DamianHistoryItem[]; facts?: TransactionFacts };

export function inferDamianResponseLength(text: string): DamianResponseLength {
  if (/\b(?:brief|briefly|short|quick|one line|just the answer|concise)\b/i.test(text)) {
    return "brief";
  }
  if (/\b(?:detail|detailed|explain|full|break it down|everything|step by step)\b/i.test(text)) {
    return "detailed";
  }
  return "standard";
}

export function redactDamianContentForPersistence(text: string) {
  return text
    .replace(/\b0x[a-fA-F0-9]{64}\b/g, "[sensitive 32-byte value omitted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~-]+\b/gi, "[auth token omitted]")
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{12,}\b/gi, "[credential omitted]");
}

function safeFact(value: string | undefined, max = 320) {
  return value?.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function stableIndex(seed: string, count: number) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % count;
}

function choose(variants: string[], seed: string) {
  return variants[stableIndex(seed, variants.length)];
}

function transactionLabel(facts: TransactionFacts) {
  const amount = safeFact(facts.amount);
  const asset = safeFact(facts.asset);
  const recipient = safeFact(facts.recipient);
  const value = amount && asset ? `${amount} ${asset}` : "the transaction";
  if (facts.action === "swapUSDCtoEURC" || facts.action === "swapEURCtoUSDC") {
    return `the swap of ${value} to ${safeFact(facts.receiveAsset) ?? "the requested asset"}`;
  }
  if (facts.action === "swapAndSend") {
    return `the swap of ${value} to ${safeFact(facts.receiveAsset) ?? "the requested asset"} and payment to ${recipient ?? "the listed recipients"}`;
  }
  if (facts.action === "swapAndBridge") {
    return `the swap of ${value} to USDC and CCTP transfer to ${recipient ?? "the destination wallet"}`;
  }
  if (facts.action === "bridgeUSDC") {
    return `the CCTP transfer of ${value} to ${recipient ?? "the destination wallet"}`;
  }
  return recipient ? `${value} to ${recipient}` : value;
}

function historyLine(item: DamianHistoryItem, index: number, detailed: boolean) {
  const counterparty = safeFact(
    item.counterpartyAddress ?? item.destinationAddress ?? undefined,
  ) ?? "counterparty unavailable";
  const direction = item.direction === "received" ? "from" : "to";
  const when = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(item.createdAt));
  const main = `${index + 1}. ${safeFact(item.amount)} ${safeFact(item.asset)} ${direction} ${counterparty} · ${safeFact(item.state)} · ${when}`;
  if (!detailed) return main;
  const metadata = [
    `Transfer ID: ${safeFact(item.id, 120)}`,
    item.txHash ? `Transaction hash: ${safeFact(item.txHash, 120)}` : null,
    item.failureReason ? `Recorded reason: ${safeFact(item.failureReason)}` : null,
  ].filter(Boolean);
  return `${main}\n${metadata.join("\n")}`;
}

export function composeDamianResponse(
  request: DamianResponseRequest,
  options: { length?: DamianResponseLength; seed?: string } = {},
) {
  const length = options.length ?? "standard";
  const facts = request.facts ?? {};
  const seed =
    options.seed ??
    `${request.event}:${facts.operationId ?? ""}:${facts.amount ?? ""}:${facts.recipient ?? ""}`;
  const label = transactionLabel(facts);

  if (request.event === "transaction_preparing") {
    const opening = choose(
      [
        `I'll check ${label} and prepare a locked preview.`,
        `Got it. I'm checking ${label} now.`,
        `I'll verify the details for ${label}, then show you the preview.`,
      ],
      seed,
    );
    if (length === "brief") return opening;
    return `${opening} Nothing executes until you confirm.`;
  }

  if (request.event === "preview_ready") {
    const intro = choose(
      [
        `I've prepared a locked plan with ${facts.stepCount ?? request.facts.details.length} steps.`,
        `Your plan with ${facts.stepCount ?? request.facts.details.length} steps is ready to review.`,
        `The transaction plan is ready and locked for review.`,
      ],
      seed,
    );
    if (length === "brief") {
      return `${intro}\n\n${request.facts.details.join("\n")}\n\nNothing executes until you confirm.`;
    }
    const safety =
      length === "detailed"
        ? "Check every amount, asset, recipient, and the Arc Testnet network. Any change requires a new locked preview. Nothing executes until you confirm."
        : "Review the locked card below. Nothing executes until you confirm.";
    return `${intro}\n\n${request.facts.details.join("\n")}\n\n${safety}`;
  }

  if (request.event === "transaction_processing") {
    const opening = choose(
      ["Confirmed. I'm submitting it now.", "Your confirmation is in. I'm processing it now.", "Confirmed. The transaction is being submitted."],
      seed,
    );
    if (length === "brief") return opening;
    return `${opening} I'm tracking ${label} on ${safeFact(facts.network) ?? "Arc Testnet"}.`;
  }

  if (request.event === "transaction_delayed") {
    if (length === "brief") return "It's still processing. Don't resubmit it yet.";
    const detail =
      "A final state hasn't been returned yet. Keep this transaction open in Activity and don't submit a replacement while it is pending.";
    return length === "detailed"
      ? `It's taking longer than usual to process ${label}. ${detail} Delays can occur while the wallet provider, Circle, or Arc returns the final state.`
      : `${choose(["It's taking a little longer than usual.", "This one is taking longer than usual to clear the network.", "It's taking longer than expected, and I'm still waiting for the final state."], seed)} ${detail}`;
  }

  if (request.event === "recipient_approval_pending") {
    if (length === "brief") return "Waiting for the recipient to approve the payment.";
    return choose(
      [
        `The request for ${label} is with the recipient now. Nothing will be submitted onchain unless they accept it within the approval window.`,
        `I've reached the approval step for ${label}. The recipient needs to accept before Coretta can submit it onchain.`,
      ],
      seed,
    );
  }

  if (request.event === "transaction_pending") {
    if (length === "brief") return "Submitted. Final confirmation is still pending.";
    return `Submitted, but final confirmation is still pending for ${label}. Track it in Activity and don't create a replacement unless the recorded state changes to failed.`;
  }

  if (request.event === "transaction_settled") {
    const settled = choose(
      ["Settled.", "The transaction has settled.", "Settlement is complete."],
      seed,
    );
    if (length === "brief") return `${settled} ${label} is complete.`;
    const hash = length === "detailed" && facts.txHash
      ? `\nTransaction hash: ${safeFact(facts.txHash, 120)}`
      : "";
    return `${settled} ${label} is complete on ${safeFact(facts.network) ?? "Arc Testnet"}. Open the receipt for the final transaction details.${hash}`;
  }

  if (request.event === "transaction_partial") {
    const settled = facts.settledCount ?? 0;
    const pending = facts.pendingCount ?? 0;
    const failed = facts.failedCount ?? 0;
    const total = facts.totalCount ?? settled + pending + failed;
    if (length === "brief") {
      return `Partially completed. ${settled} of ${total} settled, ${pending} pending, and ${failed} failed.`;
    }
    return `The batch only partially completed. ${settled} of ${total} settled, ${pending} remain pending, and ${failed} failed. Review each payment leg in Activity before retrying anything.`;
  }

  if (request.event === "transaction_failed") {
    const reason = safeFact(facts.reason) ?? "No final failure reason was returned.";
    if (length === "brief") return `The transaction didn't complete. ${reason}`;
    return `${choose(["That transaction didn't complete.", "The transaction came back unsuccessful.", "I couldn't get this transaction to a completed state."], seed)} ${reason} Check its recorded state in Activity before trying again.`;
  }

  if (request.event === "preview_cancelled") {
    return length === "brief"
      ? "Preview cancelled. Nothing was submitted."
      : "Preview cancelled. Nothing was submitted, and you can prepare a different transaction when you're ready.";
  }

  if (request.event === "transaction_busy") {
    return length === "brief"
      ? "Your current transaction is still being tracked."
      : "Your current transaction is still being tracked. You can keep asking questions, but wait for its final state or use Activity before preparing another transaction.";
  }

  if (request.event === "history_permission_required") {
    return "I don't have permission to use your transaction history. Enable Use transaction history in Settings, or provide the address you want to use.";
  }

  if (request.event === "history_empty") {
    return choose(
      [
        "I couldn't find a transaction matching those details.",
        "Nothing in your available history matches that search.",
        "I checked the available history, but there wasn't a match.",
      ],
      seed,
    );
  }

  if (request.event === "history_unavailable") {
    return "I couldn't retrieve your transaction history right now. No transaction details were guessed.";
  }

  const items = request.items;
  if (length === "brief") {
    return items.map((item, index) => historyLine(item, index, false)).join("\n");
  }
  const heading = choose(
    [
      `I found ${items.length} matching transaction${items.length === 1 ? "" : "s"}:`,
      `${items.length === 1 ? "This is the transaction" : "These are the transactions"} that matched:`,
      `Your search returned ${items.length} transaction${items.length === 1 ? "" : "s"}:`,
    ],
    seed,
  );
  const lines = items.map((item, index) => historyLine(item, index, length === "detailed"));
  return `${heading}\n\n${lines.join("\n\n")}`;
}
