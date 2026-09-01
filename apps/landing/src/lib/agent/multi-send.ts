import type { AssetSymbol } from "@/lib/chains";
import type { BatchRecipient } from "./types";
import { validateAmountToken } from "./security";
import {
  findCctpEvmTestnetDestinationMentions,
  MAX_BATCH_RECIPIENTS,
  type CctpEvmTestnetChainId,
} from "@coretta/shared";
import {
  accountWalletPlaceholderFromText,
  displayAccountWalletRecipient,
} from "./wallet-recipient";

const EVM_ADDRESS_ONLY_RE = /^0x[a-fA-F0-9]{40}$/;
const EMAIL_ONLY_RE = /^[\w.+-]+@[\w.-]+\.\w+$/;
const LISTED_IDENTITY_RE = /0x[a-fA-F0-9]{40}(?![a-fA-F0-9])|[\w.+-]+@[\w.-]+\.\w+/g;
const RECIPIENT_LIST_LABEL_RE = /^(?:(?:to|for)\s+)?(?:(?:this|that|the|these|those|following|listed|pasted)\s+)?(?:address(?:es)?|wallet(?:s)?|recipient(?:s)?)\s*:?$/i;
const MICRO_SCALE = 1_000_000n;

export function decimalToMicro(value: string): bigint | null {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!match) return null;
  return BigInt(match[1]) * MICRO_SCALE + BigInt((match[2] ?? "").padEnd(6, "0"));
}

export function formatMicro(value: bigint): string {
  const whole = value / MICRO_SCALE;
  const fraction = (value % MICRO_SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function sumAmounts(recipients: BatchRecipient[]): string {
  return formatMicro(
    recipients.reduce((total, recipient) => total + (decimalToMicro(recipient.amount) ?? 0n), 0n),
  );
}

export type BridgeBatchAllocation = {
  recipients: BatchRecipient[];
  total: string;
  allocation: "equal-total" | "fixed-each" | "custom" | "percentage";
};

export type MultiNetworkBridgePlan = {
  recipients: BatchRecipient[];
  total: string;
  allocation: "equal-total" | "fixed-each" | "custom" | "random";
  destinationChains: CctpEvmTestnetChainId[];
};

export type MultiNetworkBridgeParse =
  | { ok: true; plan: MultiNetworkBridgePlan }
  | { ok: false; message: string };

function addressRecipient(address: string, amount: string): BatchRecipient {
  return {
    name: address,
    amount,
    identityType: "address",
    displayAddress: address,
  };
}

/**
 * Parse an explicit multi-recipient CCTP allocation without guessing whether
 * the first amount means a total or an amount for every recipient.
 */
export function parseBridgeBatchAllocation(
  text: string,
  addresses: string[],
): BridgeBatchAllocation | null {
  if (addresses.length < 2 || addresses.length > MAX_BATCH_RECIPIENTS) return null;

  const normalizedAddresses = addresses.map((address) => address.toLowerCase());
  if (new Set(normalizedAddresses).size !== normalizedAddresses.length) return null;

  const customMatches = [
    ...text.matchAll(
      /(\d+(?:\.\d{1,6})?)\s*(?:USDC)?\s+(?:to|for|into)\s+(0x[a-fA-F0-9]{40})(?![a-fA-F0-9])/gi,
    ),
  ];
  if (customMatches.length >= 2) {
    const customByAddress = new Map<string, string>();
    for (const match of customMatches) {
      if (!validateAmountToken(match[1])) return null;
      customByAddress.set(match[2].toLowerCase(), match[1]);
    }
    if (
      customByAddress.size === addresses.length &&
      normalizedAddresses.every((address) => customByAddress.has(address))
    ) {
      const recipients = addresses.map((address) =>
        addressRecipient(address, customByAddress.get(address.toLowerCase())!),
      );
      return { recipients, total: sumAmounts(recipients), allocation: "custom" };
    }
  }

  const percentageMatches = [
    ...text.matchAll(
      /(\d+(?:\.\d{1,4})?)\s*%\s*(?:to|for|into)\s*(0x[a-fA-F0-9]{40})(?![a-fA-F0-9])/gi,
    ),
  ];
  if (percentageMatches.length >= 2) {
    const totalToken = text.match(/(?:bridge|send|transfer|move|route|forward|distribute|split|divide|share|spread|allocate|pay|remit)\s+(\d+(?:\.\d{1,6})?)\s*USDC\b/i)?.[1];
    const totalMicro = totalToken ? decimalToMicro(totalToken) : null;
    if (!totalMicro) return null;
    const percentages = new Map<string, bigint>();
    let percentageTotal = 0n;
    for (const match of percentageMatches) {
      const percentMicro = decimalToMicro(match[1]);
      if (!percentMicro || percentMicro <= 0n) return null;
      percentages.set(match[2].toLowerCase(), percentMicro);
      percentageTotal += percentMicro;
    }
    if (
      percentages.size !== addresses.length ||
      percentageTotal !== 100n * MICRO_SCALE ||
      !normalizedAddresses.every((address) => percentages.has(address))
    ) {
      return null;
    }
    let allocated = 0n;
    const recipients = addresses.map((address, index) => {
      const amountMicro =
        index === addresses.length - 1
          ? totalMicro - allocated
          : (totalMicro * percentages.get(address.toLowerCase())!) / (100n * MICRO_SCALE);
      allocated += amountMicro;
      return addressRecipient(address, formatMicro(amountMicro));
    });
    if (recipients.some((recipient) => decimalToMicro(recipient.amount) === 0n)) return null;
    return { recipients, total: formatMicro(totalMicro), allocation: "percentage" };
  }

  const fixedEach =
    /(?:bridge|send|transfer|move|route|forward|distribute|spread|allocate|pay|remit)\s+(\d+(?:\.\d{1,6})?)\s*USDC\s+(?:(?:to|for)\s+)?(?:each(?:\s+of)?|every|apiece|per\s+(?:wallet|address|recipient))/i.exec(text) ??
    /(?:each|every)\s+(?:wallet|address|recipient)[^.!?]{0,30}?(\d+(?:\.\d{1,6})?)\s*USDC\b/i.exec(text);
  if (fixedEach && validateAmountToken(fixedEach[1])) {
    const amountMicro = decimalToMicro(fixedEach[1]);
    if (!amountMicro) return null;
    const recipients = addresses.map((address) => addressRecipient(address, fixedEach[1]));
    return {
      recipients,
      total: formatMicro(amountMicro * BigInt(addresses.length)),
      allocation: "fixed-each",
    };
  }

  const hasEqualAllocation =
    /\b(?:equally|evenly|equal\s+(?:parts?|shares?)|same\s+amount|even\s+split)\b/i.test(text) ||
    /\b(?:split|divide|share|distribute|spread|allocate)\b[^.!?]{0,100}\b(?:between|among|across)\b/i.test(text) ||
    (addresses.length === 2 && /\bhalf\b[^.!?]{0,60}\b(?:each|both|between)\b/i.test(text));
  if (hasEqualAllocation) {
    const totalToken = text.match(/(\d+(?:\.\d{1,6})?)\s*USDC\b/i)?.[1];
    if (!totalToken || !validateAmountToken(totalToken)) return null;
    const amounts = allocateEqualAmounts(totalToken, addresses.length);
    if (!amounts) return null;
    return {
      recipients: addresses.map((address, index) => addressRecipient(address, amounts[index])),
      total: totalToken,
      allocation: "equal-total",
    };
  }

  return null;
}

export function allocateEqualAmounts(total: string, recipientCount: number): string[] | null {
  const totalMicro = decimalToMicro(total);
  if (
    totalMicro == null ||
    recipientCount < 2 ||
    recipientCount > MAX_BATCH_RECIPIENTS ||
    totalMicro < BigInt(recipientCount)
  ) {
    return null;
  }
  const count = BigInt(recipientCount);
  const base = totalMicro / count;
  const remainder = Number(totalMicro % count);
  return Array.from({ length: recipientCount }, (_, index) =>
    formatMicro(base + (index < remainder ? 1n : 0n)),
  );
}

function stableWeight(seed: string, index: number): bigint {
  let value = 2166136261;
  const source = `${seed}:${index}`;
  for (let cursor = 0; cursor < source.length; cursor += 1) {
    value ^= source.charCodeAt(cursor);
    value = Math.imul(value, 16777619) >>> 0;
  }
  return BigInt((value % 997) + 1);
}

export function allocateRandomAmounts(
  total: string,
  recipientCount: number,
  seed: string,
): string[] | null {
  const totalMicro = decimalToMicro(total);
  if (
    totalMicro == null ||
    recipientCount < 2 ||
    recipientCount > MAX_BATCH_RECIPIENTS ||
    totalMicro < BigInt(recipientCount)
  ) {
    return null;
  }
  const reserved = BigInt(recipientCount);
  const distributable = totalMicro - reserved;
  const weights = Array.from({ length: recipientCount }, (_, index) =>
    stableWeight(seed, index),
  );
  const weightTotal = weights.reduce((total, weight) => total + weight, 0n);
  let allocated = 0n;
  return weights.map((weight, index) => {
    const amount =
      index === weights.length - 1
        ? totalMicro - allocated
        : 1n + (distributable * weight) / weightTotal;
    allocated += amount;
    return formatMicro(amount);
  });
}

function amountTokens(text: string) {
  return [...text.matchAll(/(\d+(?:\.\d{1,6})?)\s*USDC\b/gi)].flatMap(
    (match) =>
      validateAmountToken(match[1])
        ? [{ amount: match[1], index: match.index ?? 0 }]
        : [],
  );
}

function withDestination(
  name: string,
  amount: string,
  destinationChain: CctpEvmTestnetChainId,
  destinationChainLabel: string,
): BatchRecipient {
  return {
    name,
    amount,
    identityType: "address",
    displayAddress: name.startsWith("0x")
      ? name
      : displayAccountWalletRecipient(name),
    destinationChain,
    destinationChainLabel,
  };
}

export function parseMultiNetworkBridgePlan(
  text: string,
): MultiNetworkBridgeParse | null {
  const mentions = findCctpEvmTestnetDestinationMentions(text);
  const distinctChains = [
    ...new Map(mentions.map((mention) => [mention.chain.id, mention.chain])).values(),
  ];
  if (distinctChains.length < 2) return null;

  const addresses = [...text.matchAll(/0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/g)].map(
    (match) => ({ name: match[0], index: match.index ?? 0 }),
  );
  const accountRecipient = accountWalletPlaceholderFromText(text);
  let legs: Array<{
    name: string;
    destinationChain: CctpEvmTestnetChainId;
    destinationChainLabel: string;
  }> = [];

  if (addresses.length === mentions.length) {
    legs = addresses.map((address, index) => ({
      name: address.name,
      destinationChain: mentions[index].chain.id,
      destinationChainLabel: mentions[index].chain.label,
    }));
  } else if (addresses.length > 1) {
    legs = addresses.map((address) => {
      const nearest = mentions.reduce((best, mention) => {
        const distance = Math.min(
          Math.abs(address.index - mention.start),
          Math.abs(address.index - mention.end),
        );
        return distance < best.distance ? { mention, distance } : best;
      }, { mention: mentions[0], distance: Number.POSITIVE_INFINITY }).mention;
      return {
        name: address.name,
        destinationChain: nearest.chain.id,
        destinationChainLabel: nearest.chain.label,
      };
    });
  } else if (addresses.length === 1) {
    if (!/\b(?:across|between|among|both|each|every|all)\b/i.test(text)) {
      return {
        ok: false,
        message:
          "I found several destination networks but only one wallet assignment. Say that the same address should receive on every network, or provide one wallet for each network.",
      };
    }
    legs = distinctChains.map((chain) => ({
      name: addresses[0].name,
      destinationChain: chain.id,
      destinationChainLabel: chain.label,
    }));
  } else if (accountRecipient) {
    legs = distinctChains.map((chain) => ({
      name: accountRecipient,
      destinationChain: chain.id,
      destinationChainLabel: chain.label,
    }));
  } else {
    return {
      ok: false,
      message:
        "Which wallet should receive USDC on each chain? Provide full EVM addresses, say “my wallet” or “my address” for your Coretta smart wallet, or say “my linked wallet” for your verified external wallet.",
    };
  }

  if (legs.length < 2 || legs.length > MAX_BATCH_RECIPIENTS) {
    return {
      ok: false,
      message: `One bridge plan supports from 2 to ${MAX_BATCH_RECIPIENTS} destination transfers. Reduce the requested recipients or chains.`,
    };
  }
  const uniqueLegs = new Set(
    legs.map(
      (leg) => `${leg.destinationChain}:${leg.name.toLowerCase()}`,
    ),
  );
  if (uniqueLegs.size !== legs.length) {
    return {
      ok: false,
      message:
        "The same wallet and chain pair appears more than once. Combine its amount into one destination transfer.",
    };
  }

  const tokens = amountTokens(text);
  if (tokens.length === 0) {
    return {
      ok: false,
      message: "How much USDC should I divide across these networks?",
    };
  }

  const fixedEach = /\b(\d+(?:\.\d{1,6})?)\s*USDC\s+(?:to\s+)?(?:each|every|per)\b/i.exec(text);
  let amounts: string[] | null = null;
  let total = tokens[0].amount;
  let allocation: MultiNetworkBridgePlan["allocation"];
  if (fixedEach && validateAmountToken(fixedEach[1])) {
    amounts = Array.from({ length: legs.length }, () => fixedEach[1]);
    total = formatMicro((decimalToMicro(fixedEach[1]) ?? 0n) * BigInt(legs.length));
    allocation = "fixed-each";
  } else if (/\b(?:random|randomly|varied|varying|unequal|different|mixed)\b/i.test(text)) {
    amounts = allocateRandomAmounts(total, legs.length, text.toLowerCase());
    allocation = "random";
  } else {
    const candidateAmounts =
      tokens.length === legs.length + 1
        ? tokens.slice(1).map((token) => token.amount)
        : tokens.length === legs.length
          ? tokens.map((token) => token.amount)
          : null;
    const candidateTotal = candidateAmounts
      ? candidateAmounts.reduce(
          (sum, amount) => sum + (decimalToMicro(amount) ?? 0n),
          0n,
        )
      : null;
    if (
      candidateAmounts &&
      candidateTotal &&
      (tokens.length === legs.length || candidateTotal === decimalToMicro(total))
    ) {
      amounts = candidateAmounts;
      total = formatMicro(candidateTotal);
      allocation = "custom";
    } else if (
      /\b(?:equal|equally|even|evenly|half|split|divide|share|spread|distribute|allocate)\b/i.test(
        text,
      )
    ) {
      amounts = allocateEqualAmounts(total, legs.length);
      allocation = "equal-total";
    } else {
      return {
        ok: false,
        message:
          "How should I divide the total? Say equally, use varied amounts, state one amount for every destination, or say how much each chain should receive.",
      };
    }
  }

  if (!amounts || amounts.some((amount) => decimalToMicro(amount) === 0n)) {
    return {
      ok: false,
      message:
        "The total is too small to give every destination a positive amount. Increase the total or reduce the number of destinations.",
    };
  }

  return {
    ok: true,
    plan: {
      recipients: legs.map((leg, index) =>
        withDestination(
          leg.name,
          amounts[index],
          leg.destinationChain,
          leg.destinationChainLabel,
        ),
      ),
      total,
      allocation,
      destinationChains: [...new Set(legs.map((leg) => leg.destinationChain))],
    },
  };
}

export function parseIdentity(token: string): BatchRecipient["identityType"] {
  const t = token.trim();
  if (EVM_ADDRESS_ONLY_RE.test(t)) return "address";
  if (EMAIL_ONLY_RE.test(t)) return "email";
  return "name";
}

/**
 * Split a multi-recipient tail into tokens.
 * Prefers full 0x addresses, then emails, then plain names (comma / "and").
 */
export function splitRecipients(segment: string): string[] {
  const raw = segment.replace(/[.!?]$/, "").trim();
  if (!raw) return [];

  // Extract full addresses and emails first so surrounding prose never becomes a recipient.
  const identities = raw.match(LISTED_IDENTITY_RE) ?? [];
  if (identities.length >= 2) {
    return identities;
  }
  if (identities.length === 1) {
    // One identity plus optional plain names after removing it.
    const rest = raw
      .replace(identities[0], " ")
      .split(/\s*[,;]\s*|\s+and\s+/i)
      .map((s) => s.trim())
      .filter((token) => Boolean(token) && !RECIPIENT_LIST_LABEL_RE.test(token));
    return [identities[0], ...rest];
  }

  return raw
    .split(/\s*[,;]\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function toRecipient(token: string, amount: string): BatchRecipient {
  const name = token.trim();
  const identityType = parseIdentity(name);
  return {
    name,
    amount,
    identityType,
    displayAddress: identityType === "address" ? name : undefined,
  };
}

/** Parse "50 to Sarah, 100 to David" or equal split "25 to Sarah, David, Michael" */
export function parseMultiSend(
  text: string,
  defaultAsset: AssetSymbol,
): { recipients: BatchRecipient[]; asset: AssetSymbol; total: string } | null {
  const lower = text.toLowerCase();
  if (!/\b(?:send|transfer|pay|remit|forward|distribute)\b/.test(lower)) return null;

  const asset = /\bEURC\b/i.test(text) ? "EURC" : defaultAsset;

  // Per-recipient amounts — allow 0x addresses, emails, and names.
  // Examples:
  //   "50 USDC to 0xabc…, 100 to 0xdef…"
  //   "50 to Sarah, 100 to david@email.com"
  const perAmountPattern =
    /(\d+(?:\.\d{1,6})?)\s*(?:USDC|EURC)?\s+to\s+(0x[a-fA-F0-9]{40}(?![a-fA-F0-9])|[\w.+-]+@[\w.-]+\.\w+|[A-Za-z][\w.-]*)/gi;
  const perMatches = [...text.matchAll(perAmountPattern)];
  if (perMatches.length >= 2) {
    const recipients: BatchRecipient[] = [];
    for (const m of perMatches) {
      const amount = m[1];
      const token = m[2].trim();
      if (!validateAmountToken(amount)) continue;
      recipients.push(toRecipient(token, amount));
    }
    if (recipients.length < 2) return null;
    if (recipients.length > MAX_BATCH_RECIPIENTS) return null;
    return { recipients, asset, total: sumAmounts(recipients) };
  }

  // Fixed amount per recipient. Supports "1.5 EURC each to these addresses".
  const equalMatch =
    /(?:send|transfer|pay|remit|forward|distribute)\s+(\d+(?:\.\d{1,6})?)\s*(USDC|EURC)?\s+(?:to\s+each(?:\s+of)?|each\s+to|to)\s+(?:(?:these|the)\s+)?(?:(?:addresses|wallets|recipients)\s*:?)?\s*(.+)/i.exec(text);
  if (!equalMatch) return null;

  const amount = equalMatch[1];
  if (!validateAmountToken(amount)) return null;

  const tokens = splitRecipients(equalMatch[3]);
  if (tokens.length < 2 || tokens.length > MAX_BATCH_RECIPIENTS) return null;

  // If every token after the first is not a real identity (e.g. leftover "10 to 0x…"),
  // reject equal-split so per-amount can own it (already tried above).
  const recipients = tokens.map((token) => toRecipient(token, amount));
  const looksLikeBroken =
    recipients.some(
      (r) =>
        r.identityType === "name" &&
        (/^\d/.test(r.name) || /\bto\b/i.test(r.name) || r.name.includes("0x")),
    );
  if (looksLikeBroken) return null;

  const total = sumAmounts(recipients);

  return { recipients, asset, total };
}

export function parseQuotedOutputSplit(
  text: string,
  defaultAsset: AssetSymbol,
): { recipients: BatchRecipient[]; asset: AssetSymbol } | null {
  const halfToEach = /\bhalf\b[^.!?]{0,40}\b(?:to\s+)?each\b/i.test(text);
  const hasEqualWord = /\b(?:equally|evenly)\b/i.test(text);
  const equalSplit =
    /\b(?:split|divide)\b[^.!?]{0,100}\b(?:equally|evenly)\b/i.test(text) ||
    (hasEqualWord && /\b(?:between|among|across|to|addresses?|wallets?|recipients?)\b/i.test(text));
  if (!halfToEach && !equalSplit) return null;

  const tokens = splitRecipients(text);
  if (
    tokens.length < 2 ||
    tokens.length > MAX_BATCH_RECIPIENTS ||
    (halfToEach && tokens.length !== 2)
  ) {
    return null;
  }
  const recipients = tokens.map((token) => toRecipient(token, "0"));
  if (
    recipients.some(
      (recipient) =>
        recipient.identityType === "name" &&
        (/\b(?:half|each|split|divide|equally|evenly|addresses?|wallets?|recipients?)\b/i.test(
          recipient.name,
        ) ||
          recipient.name.includes("0x")),
    )
  ) {
    return null;
  }
  return { recipients, asset: defaultAsset };
}

export function assessBatchRisk(
  recipients: BatchRecipient[],
  total: string,
): string | undefined {
  const n = recipients.length;
  const totalNum = parseFloat(total);
  if (n >= 8) {
    return `Review all ${n} recipients carefully before confirming this batch.`;
  }
  if (totalNum >= 80) {
    return "Please review carefully. This transfer differs from your normal activity.";
  }
  if (recipients.some((r) => r.identityType === "email" && !r.name.includes("@"))) {
    return undefined;
  }
  return undefined;
}
