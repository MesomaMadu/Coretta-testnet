import type { BatchRecipient, TransactionPreview } from "./types";
import { MAX_BATCH_RECIPIENTS } from "@coretta/shared";

export const MAX_REMIT_RECIPIENTS = MAX_BATCH_RECIPIENTS;

export type RemitRecipientPayload =
  | { type: "wallet"; value: string }
  | { type: "email"; value: string };

export type RemitTarget = {
  amount: string;
  label: string;
  payload: RemitRecipientPayload;
};

const EVM_RE = /0x[a-fA-F0-9]{40}/i;
const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w+/;

/** Resolve a free-text token to an on-chain remit payload (wallet or email only). */
export function resolveRemitPayload(token: string): RemitRecipientPayload | null {
  const t = token.trim();
  if (/^0x[a-fA-F0-9]{40}$/i.test(t)) {
    return { type: "wallet", value: t };
  }
  if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(t)) {
    return { type: "email", value: t };
  }
  const evm = t.match(EVM_RE);
  if (evm) return { type: "wallet", value: evm[0] };
  const email = t.match(EMAIL_RE);
  if (email) return { type: "email", value: email[0] };
  return null;
}

function batchEntryToTarget(r: BatchRecipient): RemitTarget | null {
  // Prefer typed identity, then re-parse the name field.
  if (r.identityType === "address") {
    const payload = resolveRemitPayload(r.name);
    if (payload?.type === "wallet") {
      return { amount: r.amount, label: payload.value, payload };
    }
  }
  if (r.identityType === "email") {
    const payload = resolveRemitPayload(r.name);
    if (payload?.type === "email") {
      return { amount: r.amount, label: payload.value, payload };
    }
  }
  const payload = resolveRemitPayload(r.name);
  if (!payload) return null;
  return { amount: r.amount, label: payload.value, payload };
}

/**
 * Build 1–20 remit targets from a locked preview.
 * Multi-send uses `batch`; single send uses `recipient` + `amount`.
 */
export function buildRemitTargets(
  preview: Pick<
    TransactionPreview,
    "batch" | "recipient" | "amount"
  >,
): { ok: true; targets: RemitTarget[] } | { ok: false; reason: string } {
  if (preview.batch && preview.batch.length > 0) {
    if (preview.batch.length > MAX_REMIT_RECIPIENTS) {
      return {
        ok: false,
        reason: `Maximum ${MAX_REMIT_RECIPIENTS} wallets per transfer. You listed ${preview.batch.length}.`,
      };
    }
    const targets: RemitTarget[] = [];
    const unresolvable: string[] = [];
    for (const r of preview.batch) {
      const t = batchEntryToTarget(r);
      if (!t) {
        unresolvable.push(r.name);
        continue;
      }
      targets.push(t);
    }
    if (unresolvable.length > 0) {
      return {
        ok: false,
        reason: `These recipients are names only and cannot be settled on-chain yet: ${unresolvable.join(", ")}. Use full EVM addresses (0x…) or emails.`,
      };
    }
    if (targets.length === 0) {
      return {
        ok: false,
        reason:
          "Recipient must be a full EVM address (0x…) or email. Names alone cannot be settled on-chain yet.",
      };
    }
    // Dedupe by wallet/email value (keep first amount)
    const seen = new Set<string>();
    const deduped: RemitTarget[] = [];
    for (const t of targets) {
      const key = `${t.payload.type}:${t.payload.value.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(t);
    }
    if (deduped.length > MAX_REMIT_RECIPIENTS) {
      return {
        ok: false,
        reason: `Maximum ${MAX_REMIT_RECIPIENTS} wallets per transfer.`,
      };
    }
    return { ok: true, targets: deduped };
  }

  // Single recipient (caller may already have replaced "Your wallet" with an EOA)
  const text = preview.recipient.trim();
  const payload = resolveRemitPayload(text);
  if (!payload) {
    return {
      ok: false,
      reason:
        "Recipient must be a full EVM address (0x…) or email. Names alone cannot be settled on-chain yet.",
    };
  }
  return {
    ok: true,
    targets: [{ amount: preview.amount, label: payload.value, payload }],
  };
}
