import type { AssetSymbol } from "@/lib/chains";
import type { BatchRecipient } from "./types";
import { validateAmountToken } from "./security";

const MAX_RECIPIENTS = 10;

/** Full EVM address (0x + 40 hex). */
const EVM_ADDRESS_RE = /0x[a-fA-F0-9]{40}/g;
const EVM_ADDRESS_ONLY_RE = /^0x[a-fA-F0-9]{40}$/;
const EMAIL_ONLY_RE = /^[\w.+-]+@[\w.-]+\.\w+$/;

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

  // Extract full EVM addresses first so they never get truncated into "names".
  const addresses = raw.match(EVM_ADDRESS_RE) ?? [];
  if (addresses.length >= 2) {
    return addresses.map((a) => a);
  }
  if (addresses.length === 1) {
    // One address + maybe other tokens after removing it
    const rest = raw
      .replace(addresses[0], " ")
      .split(/\s*,\s*|\s+and\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
    return [addresses[0], ...rest];
  }

  return raw
    .split(/\s*,\s*|\s+and\s+/i)
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
  if (!lower.includes("send") && !lower.includes("transfer")) return null;

  const asset = /\bEURC\b/i.test(text) ? "EURC" : defaultAsset;

  // Per-recipient amounts — allow 0x addresses, emails, and names.
  // Examples:
  //   "50 USDC to 0xabc…, 100 to 0xdef…"
  //   "50 to Sarah, 100 to david@email.com"
  const perAmountPattern =
    /(\d+(?:\.\d{1,6})?)\s*(?:USDC|EURC)?\s+to\s+(0x[a-fA-F0-9]{40}|[\w.+-]+@[\w.-]+\.\w+|[A-Za-z][\w.-]*)/gi;
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
    if (recipients.length > MAX_RECIPIENTS) return null;
    const total = recipients
      .reduce((s, r) => s + parseFloat(r.amount), 0)
      .toFixed(6)
      .replace(/\.?0+$/, "");
    return { recipients: dedupeRecipients(recipients), asset, total };
  }

  // Equal split: "send 25 USDC to 0xA…, 0xB…" or "send 25 to Sarah, David, and Michael"
  const equalMatch =
    /(?:send|transfer)\s+(\d+(?:\.\d{1,6})?)\s*(USDC|EURC)?\s+to\s+(.+)/i.exec(text);
  if (!equalMatch) return null;

  const amount = equalMatch[1];
  if (!validateAmountToken(amount)) return null;

  const tokens = splitRecipients(equalMatch[3]);
  if (tokens.length < 2 || tokens.length > MAX_RECIPIENTS) return null;

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

  const total = (parseFloat(amount) * recipients.length)
    .toFixed(6)
    .replace(/\.?0+$/, "");

  return { recipients: dedupeRecipients(recipients), asset, total };
}

function dedupeRecipients(list: BatchRecipient[]): BatchRecipient[] {
  const seen = new Set<string>();
  const out: BatchRecipient[] = [];
  for (const r of list) {
    const key = r.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export function assessBatchRisk(
  recipients: BatchRecipient[],
  total: string,
): string | undefined {
  const n = recipients.length;
  const totalNum = parseFloat(total);
  if (n >= 8) {
    return "Please review carefully. You're sending to many recipients at once.";
  }
  if (totalNum >= 80) {
    return "Please review carefully. This transfer differs from your normal activity.";
  }
  if (recipients.some((r) => r.identityType === "email" && !r.name.includes("@"))) {
    return undefined;
  }
  return undefined;
}
