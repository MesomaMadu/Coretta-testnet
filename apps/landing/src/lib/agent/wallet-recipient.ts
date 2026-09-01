export const BOUND_SMART_WALLET = "__BOUND_SMART_WALLET__" as const;
export const BOUND_MAIN_WALLET = "__BOUND_MAIN_WALLET__" as const;

export type AccountWalletPlaceholder =
  | typeof BOUND_SMART_WALLET
  | typeof BOUND_MAIN_WALLET;

export type AccountWalletBindings = {
  smartWalletAddress?: string | null;
  boundPrimaryWallet?: string | null;
};

const FULL_EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export function accountWalletPlaceholderFromText(
  text: string,
): AccountWalletPlaceholder | null {
  if (
    /\b(?:my\s+)?(?:coretta|smart|managed)(?:\s+(?:smart|managed))?\s+wallet\b/i.test(
      text,
    )
  ) {
    return BOUND_SMART_WALLET;
  }
  if (
    /\b(?:my\s+)?(?:connected|linked|external|browser|main|self[-\s]?custodied)\s+(?:external\s+)?wallet\b/i.test(
      text,
    )
  ) {
    return BOUND_MAIN_WALLET;
  }
  if (
    /\bmy\s+wallet\b/i.test(text) ||
    /\bmy\s+(?:(?:coretta|smart)\s+)?(?:wallet\s+)?address\b/i.test(text) ||
    /\bto\s+myself\b/i.test(text) ||
    /\b(?:to|into|on)\s+my\s+(?:coretta\s+)?account\b/i.test(text) ||
    /\bmy\s+balance\s+to\b/i.test(text)
  ) {
    return BOUND_SMART_WALLET;
  }
  return null;
}

export function displayAccountWalletRecipient(value: string): string {
  if (value === BOUND_SMART_WALLET) return "your Coretta smart wallet";
  if (value === BOUND_MAIN_WALLET) return "your linked external wallet";
  return value;
}

export function resolveAccountWalletRecipient(
  placeholder: AccountWalletPlaceholder,
  bindings: AccountWalletBindings,
):
  | { ok: true; address: string }
  | { ok: false; reason: "smart_wallet_missing" | "linked_wallet_missing" } {
  const candidate =
    placeholder === BOUND_SMART_WALLET
      ? bindings.smartWalletAddress
      : bindings.boundPrimaryWallet;
  if (!candidate || !FULL_EVM_ADDRESS.test(candidate)) {
    return {
      ok: false,
      reason:
        placeholder === BOUND_SMART_WALLET
          ? "smart_wallet_missing"
          : "linked_wallet_missing",
    };
  }
  return { ok: true, address: candidate };
}
