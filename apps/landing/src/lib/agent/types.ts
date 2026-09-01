import type { AssetSymbol } from "@/lib/chains";

export type AllowedAction =
  | "sendUSDC"
  | "sendEURC"
  | "swapUSDCtoEURC"
  | "swapEURCtoUSDC"
  | "swapAndSend"
  | "swapAndBridge"
  | "bridgeUSDC";

export type RecipientIdentityType = "name" | "email" | "address";

export interface BatchRecipient {
  name: string;
  amount: string;
  identityType: RecipientIdentityType;
  displayAddress?: string;
  destinationChain?: import("@coretta/shared").CctpEvmTestnetChainId;
  destinationChainLabel?: string;
}

export interface TransactionPreview {
  id: string;
  action: AllowedAction;
  recipient: string;
  amount: string;
  asset: AssetSymbol;
  receiveAsset?: AssetSymbol;
  receiveAmount?: string;
  quoteStatus?: "loading" | "ready";
  quotedAt?: string;
  /** Quote output must be divided across the batch before the preview is locked. */
  allocation?:
    | "equal-output"
    | "equal-total"
    | "fixed-each"
    | "custom"
    | "percentage"
    | "random";
  swapRoute?: string;
  sponsorship: "sponsored" | "user-paid";
  /** Only populated and displayed when sponsorship is disabled. */
  transactionFee?: string;
  network: string;
  sourceChain?: "Arc_Testnet";
  destinationChain?: import("@coretta/shared").CctpEvmTestnetChainId;
  destinationChainLabel?: string;
  bridgeOperationId?: string;
  bridgeBatchId?: string;
  estimatedBridgeFee?: string;
  executionPath: string;
  previewHash: string;
  createdAt: number;
  /** Multi-send batch (max 20 recipients) */
  batch?: BatchRecipient[];
  totalAmount?: string;
  recipientCount?: number;
  riskWarning?: string;
  steps: Array<{
    id: string;
    label: string;
    detail: string;
    kind: "swap" | "send" | "settle" | "bridge";
  }>;
}

export interface AgentMessage {
  id: string;
  /** Optional backend message id (when signed in) */
  serverId?: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  delivery?: "sending" | "sent" | "failed";
  kind?: "text" | "receipt_offer" | "approval_offer";
  receiptTxId?: string;
  approvalId?: string;
  approvalStatus?: "pending" | "accepted" | "rejected";
}

export interface ConversationSummary {
  id: string;
  title: string;
  status: "ACTIVE" | "ARCHIVED";
  preview: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ParseResult =
  | { ok: true; preview: TransactionDraft }
  | {
      ok: false;
      reason: "ambiguous" | "blocked" | "unsupported";
      message: string;
      requiresClarification?: boolean;
      draft?: TransactionDraft;
    };

export type TransactionDraft = Omit<
  TransactionPreview,
  "id" | "previewHash" | "createdAt"
>;

export type AgentPhase =
  | "idle"
  | "listening"
  | "thinking"
  | "preview"
  | "awaiting_signature"
  | "executing"
  | "complete"
  | "error";
