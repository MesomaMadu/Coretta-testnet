export type DamianHistoryPeriod =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "last_month";

export type DamianHistoryQuery = {
  direction?: "sent" | "received";
  states?: string[];
  period?: DamianHistoryPeriod;
  destinationAddresses?: string[];
  asset?: "USDC" | "EURC";
  transferId?: string;
  txHash?: string;
  limit: number;
};

function historyPeriod(text: string): DamianHistoryPeriod | undefined {
  if (/\byesterday\b/i.test(text)) return "yesterday";
  if (/\blast\s+7\s+days\b/i.test(text)) return "last_7_days";
  if (/\blast\s+30\s+days\b/i.test(text)) return "last_30_days";
  if (/\bthis\s+month\b/i.test(text)) return "this_month";
  if (/\blast\s+month\b/i.test(text)) return "last_month";
  if (/\btoday\b/i.test(text)) return "today";
  return undefined;
}

function historyStates(text: string) {
  if (/\b(?:failed|rejected|denied|expired|unsuccessful)\b/i.test(text)) {
    return ["FAILED", "POLICY_DENIED", "REJECTED", "EXPIRED"];
  }
  if (/\b(?:pending|processing|submitted|waiting)\b/i.test(text)) {
    return ["REQUESTED", "POLICY_OK", "PENDING_APPROVAL", "SUBMITTED"];
  }
  if (/\b(?:settled|successful|completed|complete)\b/i.test(text)) {
    return ["SETTLED", "INCLUDED"];
  }
  return undefined;
}

export function parseDamianHistoryQuery(text: string): DamianHistoryQuery | null {
  const hasHistoryIntent =
    /\b(?:transaction|transfer|payment)\s+history\b/i.test(text) ||
    /\b(?:show|list|find|get|check|status|what happened)\b[^.!?]{0,80}\b(?:transactions?|transfers?|payments?)\b/i.test(text) ||
    /\b(?:last|recent|failed|pending|processing|settled|successful|received|incoming|sent|outgoing)\b[^.!?]{0,50}\b(?:transactions?|transfers?|payments?)\b/i.test(text) ||
    /\b(?:transaction|transfer)\s+(?:id|hash|number|#)\b/i.test(text);
  if (!hasHistoryIntent) return null;

  const txHash = text.match(/\b0x[a-fA-F0-9]{64}\b/)?.[0];
  const destination = text.match(/\b0x[a-fA-F0-9]{40}\b/)?.[0];
  const transferId = /\b(?:transaction|transfer)\s+(?:id|number|#)\s*(?:is\s+)?[:#]?\s*([A-Za-z0-9_-]{8,120})\b/i.exec(
    text,
  )?.[1];
  const requestedLimit = /\b(?:last|recent|show|list)\s+(\d{1,2})\b/i.exec(text)?.[1];
  const limit = Math.min(Math.max(Number(requestedLimit ?? 5), 1), 20);
  const asset = text.match(/\b(USDC|EURC)\b/i)?.[1]?.toUpperCase() as
    | "USDC"
    | "EURC"
    | undefined;

  return {
    direction: /\b(?:received|incoming)\b/i.test(text) ? "received" : "sent",
    states: historyStates(text),
    period: historyPeriod(text),
    destinationAddresses: destination ? [destination] : undefined,
    asset,
    transferId,
    txHash,
    limit,
  };
}
