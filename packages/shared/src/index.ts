/** Arc Testnet — verified in Arc docs */
export const ARC_TESTNET_CHAIN_ID = 5042002;

export const ARC_TESTNET_RPC =
  process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network";

export const ARC_EXPLORER = "https://testnet.arcscan.app";

/** USDC ERC-20 on Arc Testnet (6 decimals for transfers) */
export const USDC_ADDRESS =
  "0x3600000000000000000000000000000000000000" as const;

/** Circle Paymaster v0.7 on Arc Testnet */
export const PAYMASTER_V07_ADDRESS =
  "0x31BE08D380A21fc740883c0BC434FcFc88740b58" as const;

/** Circle Paymaster v0.8 on Arc Testnet */
export const PAYMASTER_V08_ADDRESS =
  "0x3BA9A96eE3eFf3A69E2B18886AcF52027EFF8966" as const;

export const USDC_DECIMALS = 6;

/** ArcRemit policy: max remittance per transfer (micro-USDC, 6 decimals) */
export const MAX_TRANSFER_MICRO = 100_000_000n; // $100.00

export const DEFAULT_DAILY_SEND_LIMIT_MICRO = 500_000_000n; // $500/day
export const DEFAULT_DAILY_TX_LIMIT = 50;

export type TransferState =
  | "REQUESTED"
  | "POLICY_OK"
  | "POLICY_DENIED"
  | "BUILT"
  | "SIGNED"
  | "SUBMITTED"
  | "INCLUDED"
  | "SETTLED"
  | "FAILED";

export type IdentityType = "email" | "phone";

export interface RemitRequest {
  recipient: { type: IdentityType; value: string };
  amount: string;
  idempotencyKey: string;
}

export interface ApiError {
  code: string;
  message: string;
}

export function parseUsdcToMicro(amount: string): bigint {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
    throw new Error("INVALID_AMOUNT_FORMAT");
  }
  const [whole, frac = ""] = trimmed.split(".");
  const padded = frac.padEnd(USDC_DECIMALS, "0").slice(0, USDC_DECIMALS);
  return BigInt(whole + padded);
}

export function formatMicroToUsdc(micro: bigint): string {
  const s = micro.toString().padStart(USDC_DECIMALS + 1, "0");
  const whole = s.slice(0, -USDC_DECIMALS) || "0";
  const frac = s.slice(-USDC_DECIMALS).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) throw new Error("INVALID_PHONE");
  return `+${digits}`;
}
