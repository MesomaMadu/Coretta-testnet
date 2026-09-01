/** Map raw errors to user-facing transaction failure reasons */

export function humanizeTxFailure(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (lower.includes("recipient rejected") || lower.includes("approval_rejected")) {
    return "The recipient rejected this payment request.";
  }
  if (lower.includes("approval expired") || lower.includes("approval_expired")) {
    return "The recipient approval window expired.";
  }
  if (lower.includes("user rejected") || lower.includes("denied") || lower.includes("rejected")) {
    return "The wallet owner rejected the request.";
  }
  if (lower.includes("insufficient") || lower.includes("balance")) {
    return "Your wallet does not contain enough funds to complete this transfer.";
  }
  if (lower.includes("paymaster") || lower.includes("sponsor")) {
    return "The paymaster rejected this USDC network-fee request.";
  }
  if (lower.includes("bundler")) {
    return "The transaction could not be submitted by the bundler. Please try again.";
  }
  if (
    lower.includes("swap_service_unavailable") ||
    lower.includes("swap service is temporarily unavailable") ||
    lower.includes("err_require_esm") ||
    lower.includes("require() of es module")
  ) {
    return "The swap service is temporarily unavailable. Please try again shortly.";
  }
  if (lower.includes("congestion") || lower.includes("timeout") || lower.includes("nonce")) {
    return "The network was unable to process the transaction at this time.";
  }
  if (lower.includes("invalid") && lower.includes("recipient")) {
    return "The recipient address appears to be invalid.";
  }
  if (lower.includes("policy_denied") || lower.includes("policy")) {
    return "This transfer was denied by policy limits.";
  }

  return "An unknown execution error occurred.";
}

export function mapTransferStateToLifecycle(
  state: string,
): "pending" | "settled" | "failed" {
  if (state === "SETTLED" || state === "INCLUDED") return "settled";
  if (["FAILED", "POLICY_DENIED", "REJECTED", "EXPIRED"].includes(state)) return "failed";
  return "pending";
}
