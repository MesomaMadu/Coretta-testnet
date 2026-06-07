import type { AssetSymbol } from "@/lib/chains";
import type { BatchRecipient } from "./types";
import { validateAmountToken } from "./security";

const MAX_RECIPIENTS = 10;

function parseIdentity(name: string): BatchRecipient["identityType"] {
  if (/^0x[a-fA-F0-9]{40}$/.test(name.trim())) return "address";
  if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(name.trim())) return "email";
  return "name";
}

function splitNames(segment: string): string[] {
  return segment
    .split(/\s*,\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse "50 to Sarah, 100 to David" or equal split "25 to Sarah, David, Michael" */
export function parseMultiSend(
  text: string,
  defaultAsset: AssetSymbol,
): { recipients: BatchRecipient[]; asset: AssetSymbol; total: string } | null {
  const lower = text.toLowerCase();
  if (!lower.includes("send") && !lower.includes("transfer")) return null;

  const asset = /\bEURC\b/i.test(text) ? "EURC" : defaultAsset;

  // Per-recipient amounts: "50 to Sarah, 100 to David, 20 to Maria"
  const perAmountPattern =
    /(\d+(?:\.\d{1,6})?)\s*(?:USDC|EURC)?\s+to\s+([A-Za-z@][\w.@+-]*)/gi;
  const perMatches = [...text.matchAll(perAmountPattern)];
  if (perMatches.length >= 2) {
    const recipients: BatchRecipient[] = [];
    for (const m of perMatches) {
      const amount = m[1];
      const name = m[2].trim();
      if (!validateAmountToken(amount)) continue;
      recipients.push({
        name,
        amount,
        identityType: parseIdentity(name),
        displayAddress:
          parseIdentity(name) === "address" ? name : `Resolved · ${name}`,
      });
    }
    if (recipients.length < 2) return null;
    if (recipients.length > MAX_RECIPIENTS) return null;
    const total = recipients
      .reduce((s, r) => s + parseFloat(r.amount), 0)
      .toFixed(6)
      .replace(/\.?0+$/, "");
    return { recipients: dedupeRecipients(recipients), asset, total };
  }

  // Equal split: "send 25 USDC to Sarah, David, and Michael"
  const equalMatch =
    /(?:send|transfer)\s+(\d+(?:\.\d{1,6})?)\s*(USDC|EURC)?\s+to\s+(.+)/i.exec(text);
  if (!equalMatch) return null;

  const amount = equalMatch[1];
  if (!validateAmountToken(amount)) return null;

  const namesRaw = equalMatch[3].replace(/[.!?]$/, "");
  const names = splitNames(namesRaw);
  if (names.length < 2 || names.length > MAX_RECIPIENTS) return null;

  const recipients = names.map((name) => ({
    name,
    amount,
    identityType: parseIdentity(name),
    displayAddress:
      parseIdentity(name) === "address" ? name : `Resolved · ${name}`,
  }));

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
