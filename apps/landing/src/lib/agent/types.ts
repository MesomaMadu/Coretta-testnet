import type { AssetSymbol } from "@/lib/chains";

export type AllowedAction =
  | "sendUSDC"
  | "sendEURC"
  | "swapUSDCtoEURC"
  | "swapEURCtoUSDC";

export type RecipientIdentityType = "name" | "email" | "address";

export interface BatchRecipient {
  name: string;
  amount: string;
  identityType: RecipientIdentityType;
  displayAddress?: string;
}

export interface TransactionPreview {
  id: string;
  action: AllowedAction;
  recipient: string;
  amount: string;
  asset: AssetSymbol;
  receiveAsset?: AssetSymbol;
  receiveAmount?: string;
  swapRoute?: string;
  sponsorship: "sponsored" | "user-paid";
  /** Only populated and displayed when sponsorship is disabled. */
  transactionFee?: string;
  network: "Arc Testnet";
  executionPath: string;
  previewHash: string;
  createdAt: number;
  /** Multi-send batch (max 10 recipients) */
  batch?: BatchRecipient[];
  totalAmount?: string;
  recipientCount?: number;
  riskWarning?: string;
}

export interface AgentMessage {
  id: string;
  /** Optional backend message id (when signed in) */
  serverId?: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export type ParseResult =
  | { ok: true; preview: Omit<TransactionPreview, "id" | "previewHash" | "createdAt"> }
  | { ok: false; reason: "ambiguous" | "blocked" | "unsupported"; message: string };

export type AgentPhase =
  | "idle"
  | "listening"
  | "thinking"
  | "preview"
  | "awaiting_signature"
  | "executing"
  | "complete"
  | "error";
