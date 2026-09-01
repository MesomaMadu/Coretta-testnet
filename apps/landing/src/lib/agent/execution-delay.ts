export const TRANSACTION_DELAY_NOTICE_MS = 60_000;

/** One cancellable notice per submitted operation, never before one minute. */
export function scheduleTransactionDelayNotice(notify: () => void): () => void {
  const timer = setTimeout(notify, TRANSACTION_DELAY_NOTICE_MS);
  return () => clearTimeout(timer);
}
