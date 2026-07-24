/** Client-side wallet session keys — no secrets stored */

export const WALLET_VERIFY_KEY = "coretta_wallet_verified";
export const WALLET_VERIFY_ADDR_KEY = "coretta_wallet_verified_address";
export const SMART_WALLET_ACTIVE_KEY = "coretta_smart_wallet_active";
export const BOUND_WALLET_KEY = "coretta_bound_wallet";

export function buildRebindMessage(params: {
  address: string;
  email: string;
  chainId: number;
}) {
  const issuedAt = new Date().toISOString();
  return `Authorize Coretta wallet replacement

New Wallet: ${params.address}
Verified Email: ${params.email}
Chain ID: ${params.chainId}
Issued At: ${issuedAt}

This confirms you want to bind this wallet to your Coretta account. Your previous wallet will lose privileged access.`;
}

export function buildOwnershipMessage(address: string, chainId: number) {
  const issuedAt = new Date().toISOString();
  return `Sign this message to verify ownership of your wallet and activate your Coretta session.

Address: ${address}
Chain ID: ${chainId}
Issued At: ${issuedAt}

This request will not trigger a blockchain transaction or cost any gas fees.`;
}

export function buildTransactionAuthMessage(params: {
  address: string;
  previewHash: string;
  action: string;
  amount: string;
  asset: string;
  recipient: string;
}) {
  return `Authorize Coretta transaction preview

Action: ${params.action}
Amount: ${params.amount} ${params.asset}
Recipient: ${params.recipient}
Preview Hash: ${params.previewHash}
Wallet: ${params.address}

This authorization does not execute the transfer. You must approve the transaction in your wallet.`;
}

/**
 * Ownership verification is connection-scoped only (sessionStorage).
 * Full disconnect clears it so the next connect always re-prompts a sign.
 */
export function clearWalletVerification(address?: string) {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(WALLET_VERIFY_KEY);
  sessionStorage.removeItem(WALLET_VERIFY_ADDR_KEY);
  if (address) {
    localStorage.removeItem(`coretta_verified_${address.toLowerCase()}`);
  } else {
    const legacy: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("coretta_verified_")) legacy.push(k);
    }
    for (const k of legacy) localStorage.removeItem(k);
  }
  window.dispatchEvent(new Event("coretta-wallet-verification-cleared"));
}

export function clearWalletSession() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SMART_WALLET_ACTIVE_KEY);
  clearWalletVerification();
}

export function getBoundWallet(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(BOUND_WALLET_KEY) ?? sessionStorage.getItem(BOUND_WALLET_KEY);
}

export function setBoundWallet(address: string) {
  localStorage.setItem(BOUND_WALLET_KEY, address.toLowerCase());
  sessionStorage.setItem(BOUND_WALLET_KEY, address.toLowerCase());
}

export function clearBoundWallet() {
  localStorage.removeItem(BOUND_WALLET_KEY);
  sessionStorage.removeItem(BOUND_WALLET_KEY);
}

export function isWalletVerifiedFor(address: string): boolean {
  if (typeof window === "undefined" || !address) return false;
  return (
    sessionStorage.getItem(WALLET_VERIFY_KEY) === "true" &&
    sessionStorage.getItem(WALLET_VERIFY_ADDR_KEY)?.toLowerCase() === address.toLowerCase()
  );
}

export function setWalletVerified(address: string) {
  if (typeof window === "undefined" || !address) return;
  const normalized = address.toLowerCase();
  // Strip legacy durable flag so reconnect always requires a fresh signature.
  localStorage.removeItem(`coretta_verified_${normalized}`);
  sessionStorage.setItem(WALLET_VERIFY_KEY, "true");
  sessionStorage.setItem(WALLET_VERIFY_ADDR_KEY, normalized);
  window.dispatchEvent(
    new CustomEvent("coretta-wallet-verified", { detail: { address: normalized } }),
  );
}

export function isSmartWalletActive(): boolean {
  if (typeof window === "undefined") return false;
  return (
    localStorage.getItem(SMART_WALLET_ACTIVE_KEY) === "true" ||
    sessionStorage.getItem(SMART_WALLET_ACTIVE_KEY) === "true"
  );
}

export function setSmartWalletActive(active: boolean) {
  if (active) {
    localStorage.setItem(SMART_WALLET_ACTIVE_KEY, "true");
    sessionStorage.setItem(SMART_WALLET_ACTIVE_KEY, "true");
  } else {
    localStorage.removeItem(SMART_WALLET_ACTIVE_KEY);
    sessionStorage.removeItem(SMART_WALLET_ACTIVE_KEY);
  }
}
