"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { History, Mic, MicOff, Send, Square } from "lucide-react";
import { useAccount, useSignMessage } from "wagmi";
import AIOrb from "@/components/ai/AIOrb";
import ChatBubble from "@/components/ai/ChatBubble";
import TransactionPreviewCard from "./TransactionPreviewCard";
import TransactionStatusCard from "./TransactionStatusCard";
import TransactionReceiptModal from "./TransactionReceiptModal";
import ChatHistoryDrawer from "@/components/ai/ChatHistoryDrawer";
import ReportIssueButton from "@/components/ai/ReportIssueButton";
import SmartWalletActivation from "./SmartWalletActivation";
import { useAgentChat } from "@/hooks/useAgentChat";
import { useProfile } from "@/hooks/useProfile";
import { useVoice } from "@/hooks/useVoice";
import { useWalletSession } from "@/hooks/useWalletSession";
import { useWalletTracking } from "@/hooks/useWalletTracking";
import { useI18n } from "@/lib/i18n/context";
import { AGENT_NAME } from "@/lib/brand";
import { ApiError, apiFetch, getApiToken } from "@/lib/api";
import {
  ARC_TESTNET_CHAIN_ID,
  buildTransactionAuthorizationMessage,
  type RemitRequest,
} from "@coretta/shared";
import { getTransactions, upsertTransaction, type TransactionRecord } from "@/lib/transaction-store";
import { humanizeTxFailure, mapTransferStateToLifecycle } from "@/lib/tx-errors";
import {
  buildRemitTargets,
  MAX_REMIT_RECIPIENTS,
  type RemitTarget,
} from "@/lib/agent/remit-targets";
import { Button } from "@/components/ui/button";

interface Props {
  onRequestWallet: () => void;
}

export default function AIAgentPanel({ onRequestWallet }: Props) {
  const [input, setInput] = useState("");
  const [voiceDraft, setVoiceDraft] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<TransactionRecord | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasDisconnectedRef = useRef(false);
  const { address, isConnected, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { profile, hydrated } = useProfile();
  const { t } = useI18n();
  const {
    verified,
    smartWalletActive,
    verifying,
    activating,
    verifyOwnership,
    activateSmartWallet,
    canTransact,
    isBoundMismatch,
    smartWalletAddress,
    emailOnlyMode,
    identityConnected,
    requiresWalletSignature,
    verifyError,
    refreshUsage,
  } = useWalletSession();
  const needsWalletSignature = requiresWalletSignature !== false;
  const { track } = useWalletTracking();

  /** Push a single chatbot tx into the activity store (one row per txId). */
  const pushActivity = useCallback(
    (
      base: {
        id: string;
        asset: string;
        amount: string;
        recipient: string;
        network?: string;
        timestamp?: number;
      },
      patch: {
        status: "pending" | "settled" | "partial" | "failed";
        txHash?: string;
        explorerUrl?: string;
        failureReason?: string;
      },
    ) => {
      upsertTransaction({
        id: base.id,
        asset: base.asset,
        amount: base.amount,
        recipient: base.recipient,
        network: base.network ?? "Arc Testnet",
        timestamp: base.timestamp ?? Date.now(),
        status: patch.status,
        txHash: patch.txHash,
        explorerUrl: patch.explorerUrl,
        failureReason: patch.failureReason,
      });
    },
    [],
  );

  const notifyUsageRefresh = useCallback(() => {
    if (emailOnlyMode) {
      void refreshUsage(null);
    } else if (address) {
      void refreshUsage(address);
    }
  }, [address, emailOnlyMode, refreshUsage]);

  const greeting =
    hydrated && profile.preferredName && (isConnected || profile.linkedEmail)
      ? `${t("welcomeBack", { name: profile.preferredName })}\n${t("readyTransfer")}`
      : undefined;

  const {
    messages,
    phase,
    preview,
    txCards,
    dismissTxCard,
    executionsInFlight,
    submitUserMessage,
    confirmAndSign,
    markExecuting,
    completeExecution,
    failExecution,
    updateTxCard,
    cancelPreview,
    decideIncomingApproval,
    setPhase,
    conversations,
    conversationId,
    historyOpen,
    setHistoryOpen,
    refreshConversations,
    loadConversation,
    startNewConversation,
    archiveConversation,
  } = useAgentChat(greeting);

  const onTranscript = useCallback((text: string) => {
    setVoiceDraft(text);
    setInput(text);
  }, []);

  const { listening, supported, startListening, stopListening } = useVoice({
    onTranscript,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, preview, txCards]);

  useEffect(() => {
    if (!isConnected) wasDisconnectedRef.current = true;
  }, [isConnected]);

  useEffect(() => {
    if (!verified || !isConnected || !greeting || !wasDisconnectedRef.current) return;
    wasDisconnectedRef.current = false;
    window.dispatchEvent(
      new CustomEvent("coretta-session-restored", { detail: { message: greeting } }),
    );
  }, [verified, isConnected, greeting]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || phase === "awaiting_signature") return;
    setInput("");
    setVoiceDraft(null);
    if (verified && address) {
      void track({
        kind: "chat",
        label: `Chat: ${text.slice(0, 120)}`,
        metadata: { length: text.length },
      });
    }
    await submitUserMessage(text);
  };

  const monitorTransferAfterApproval = async (
    transferId: string,
    txId: string,
    base: {
      id: string;
      asset: string;
      amount: string;
      recipient: string;
      network?: string;
      timestamp?: number;
    },
  ) => {
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const t = await apiFetch<{
          state: string;
          txHash?: string;
          failureReason?: string;
          explorerUrl?: string;
        }>(`/v1/transfers/${transferId}`);
        const lifecycle = mapTransferStateToLifecycle(t.state);
        const failureReason = t.failureReason
          ? humanizeTxFailure(new Error(t.failureReason))
          : lifecycle === "failed"
            ? humanizeTxFailure(new Error(t.state))
            : undefined;
        const record = {
          id: txId,
          status: lifecycle as "pending" | "settled" | "failed",
          asset: base.asset,
          amount: base.amount,
          recipient: base.recipient,
          txHash: t.txHash,
          network: base.network ?? "Arc Testnet",
          timestamp: base.timestamp ?? Date.now(),
          explorerUrl: t.explorerUrl,
          failureReason,
          transferId,
          pendingReason:
            lifecycle === "pending"
              ? t.state === "PENDING_APPROVAL"
                ? "Waiting for the recipient to approve this Coretta-to-Coretta payment."
                : "Recipient accepted. The payment is being submitted on Arc Testnet."
              : undefined,
        };
        updateTxCard(record);
        pushActivity(base, {
          status: record.status,
          txHash: t.txHash,
          explorerUrl: t.explorerUrl,
          failureReason,
        });
        if (lifecycle !== "pending") {
          if (verified && address) {
            void track({
              kind: "transfer",
              label:
                lifecycle === "settled"
                  ? `Transfer settled ${record.amount} ${record.asset}`
                  : `Transfer failed ${record.amount} ${record.asset}`,
              status: lifecycle === "settled" ? "complete" : "failed",
              metadata: {
                transferId,
                txHash: record.txHash,
                recipient: record.recipient,
                amount: record.amount,
                asset: record.asset,
              },
            });
          }
          notifyUsageRefresh();
          return;
        }
      } catch {
        /* retry */
      }
    }
  };

  const handleConfirm = async () => {
    if (needsWalletSignature && (!isConnected || !address)) {
      onRequestWallet();
      return;
    }
    if (needsWalletSignature && !verified) {
      const ok = await verifyOwnership();
      if (!ok) return;
    }
    if (!canTransact) return;

    const ok = await confirmAndSign(needsWalletSignature);
    if (!ok || !preview) return;

    const isSwap =
      preview.action === "swapUSDCtoEURC" || preview.action === "swapEURCtoUSDC";
    const isCompound = preview.action === "swapAndSend";
    const isSwapBridge = preview.action === "swapAndBridge";
    const isBridge = preview.action === "bridgeUSDC";
    const txId = `${isBridge || isSwapBridge ? "bridge" : isSwap || isCompound ? "swap" : "tx"}_${Date.now()}`;
    const pendingRecord = {
      id: txId,
      status: "pending" as const,
      asset: preview.asset,
      amount: preview.amount,
      recipient: preview.recipient,
      network: preview.network,
      timestamp: Date.now(),
    };
    const activityBase = {
      id: txId,
      asset: preview.asset,
      amount: preview.amount,
      recipient: preview.recipient,
      network: preview.network,
      timestamp: pendingRecord.timestamp,
    };
    updateTxCard(pendingRecord);
    pushActivity(activityBase, { status: "pending" });
    void track({
      kind: "preview",
      label: `Confirmed ${preview.action} ${preview.amount} ${preview.asset}`,
      status: "pending",
      metadata: {
        action: preview.action,
        amount: preview.amount,
        asset: preview.asset,
        recipient: preview.recipient,
      },
    });

    const token = getApiToken();
    if (!token) {
      const reason = "Authentication session missing. Sign in again to continue.";
      failExecution(txId, reason);
      pushActivity(activityBase, { status: "failed", failureReason: reason });
      return;
    }

    markExecuting();

    if (isSwapBridge) {
      if (!preview.destinationChain || preview.receiveAsset !== "USDC" || !preview.totalAmount || !/^0x[a-fA-F0-9]{40}$/.test(preview.recipient)) {
        const reason = "A swap and bridge plan needs an output asset, bridge amount, supported destination chain, and full EVM recipient address.";
        failExecution(txId, reason);
        pushActivity(activityBase, { status: "failed", failureReason: reason });
        return;
      }

      const tokenIn = preview.asset as "USDC" | "EURC";
      const tokenOut = preview.receiveAsset;
      const idempotencyKey = crypto.randomUUID();
      let swapResult: { ok: boolean; txHash?: string; explorerUrl?: string; amountOut?: string } | undefined;
      try {
        let authorization: { message: string; signature: string } | undefined;
        if (needsWalletSignature) {
          if (!address) throw new Error("A linked wallet is required for this plan.");
          const message = buildTransactionAuthorizationMessage({
            address,
            chainId: chainId ?? ARC_TESTNET_CHAIN_ID,
            intent: {
              action: "swap_and_bridge",
              tokenIn,
              tokenOut: "USDC",
              amountIn: preview.amount,
              sourceChain: "Arc_Testnet",
              destinationChain: preview.destinationChain,
              recipientAddress: preview.recipient,
              bridgeAmount: preview.totalAmount,
              idempotencyKey,
              swapNonce: crypto.randomUUID(),
              bridgeNonce: crypto.randomUUID(),
            },
          });
          const signature = await signMessageAsync({ message });
          authorization = { message, signature };
        }

        swapResult = await apiFetch<{ ok: boolean; txHash?: string; explorerUrl?: string; amountOut?: string }>("/v1/swap", {
          method: "POST",
          body: JSON.stringify({ tokenIn, tokenOut, amountIn: preview.amount, ...(authorization ? { authorization } : {}) }),
        });
        if (!swapResult.ok) throw new Error("The swap did not complete.");

        updateTxCard({
          ...pendingRecord,
          status: "pending",
          txHash: swapResult.txHash,
          explorerUrl: swapResult.explorerUrl,
          operationKind: "swap_and_bridge",
          outputAmount: swapResult.amountOut,
          outputAsset: tokenOut,
          pendingReason: "The swap settled. Coretta is submitting the CCTP transfer.",
        });

        const bridge = await apiFetch<{
          ok: boolean;
          operationId: string;
          state: "success" | "pending" | "error";
          sourceTxHash?: string;
          destinationTxHash?: string;
          explorerUrl?: string;
          failureReason?: string;
          recoverable?: boolean;
        }>("/v1/bridge", {
          method: "POST",
          body: JSON.stringify({
            destinationChain: preview.destinationChain,
            recipientAddress: preview.recipient,
            amount: preview.totalAmount,
            idempotencyKey,
            ...(authorization ? { authorization } : {}),
          }),
        });

        const txHash = bridge.destinationTxHash ?? bridge.sourceTxHash;
        if (!bridge.ok || bridge.state === "error") {
          throw new Error(bridge.failureReason ?? "The swap settled, but the CCTP transfer did not complete.");
        }
        const status = bridge.state === "success" ? "settled" : "pending";
        updateTxCard({
          ...pendingRecord,
          status,
          txHash,
          explorerUrl: bridge.explorerUrl,
          transferId: bridge.operationId,
          operationKind: "swap_and_bridge",
          outputAmount: swapResult.amountOut,
          outputAsset: tokenOut,
          pendingReason: status === "pending" ? "The swap settled and CCTP is waiting for final destination confirmation." : undefined,
        });
        pushActivity(activityBase, { status, txHash, explorerUrl: bridge.explorerUrl });
        completeExecution(status === "settled" ? txHash : undefined, txId, status === "pending" ? { outcome: "pending" } : undefined);
        notifyUsageRefresh();
        return;
      } catch (error) {
        const details = error instanceof ApiError && error.details && typeof error.details === "object"
          ? (error.details as { operationId?: string; recoverable?: boolean; sourceTxHash?: string; destinationTxHash?: string; failureReason?: string; message?: string })
          : null;
        const underlying = details?.failureReason ?? details?.message ?? humanizeTxFailure(error);
        const reason = swapResult ? `The swap settled, but the CCTP transfer did not complete. ${underlying}` : underlying;
        const txHash = details?.destinationTxHash ?? details?.sourceTxHash ?? swapResult?.txHash;
        failExecution(txId, reason, txHash, swapResult ? {
          bridgeOperationId: details?.recoverable && details.operationId ? details.operationId : undefined,
          bridgeOnly: true,
        } : undefined);
        pushActivity(activityBase, { status: swapResult ? "partial" : "failed", txHash, failureReason: reason });
        return;
      }
    }

    if (isBridge) {
      const bridgeBatch = (preview.batch ?? []).map((recipient) => ({
        recipientAddress: recipient.name,
        amount: recipient.amount,
        destinationChain:
          recipient.destinationChain ?? preview.destinationChain!,
      }));
      if (bridgeBatch.length >= 2) {
        if (
          !preview.destinationChain ||
          bridgeBatch.some(
            (recipient) =>
              !recipient.destinationChain ||
              !/^0x[a-fA-F0-9]{40}$/.test(recipient.recipientAddress),
          )
        ) {
          const reason =
            "Every CCTP batch leg needs one supported destination chain and a full EVM recipient address.";
          failExecution(txId, reason);
          pushActivity(activityBase, { status: "failed", failureReason: reason });
          return;
        }
        if (preview.bridgeBatchId) {
          try {
            const current = await apiFetch<{
              id: string;
              operations: Array<{
                id: string;
                status: string;
                recoverable: boolean;
              }>;
            }>(`/v1/bridge/batches/${encodeURIComponent(preview.bridgeBatchId)}`);
            const operationIds = current.operations
              .filter((operation) => operation.status === "FAILED" && operation.recoverable)
              .map((operation) => operation.id);
            if (operationIds.length === 0) {
              throw new Error(
                "This batch has no failed CCTP leg with safe Circle recovery data. Create a new preview for any transfer that never started.",
              );
            }

            let authorization: { message: string; signature: string } | undefined;
            if (needsWalletSignature) {
              if (!address) throw new Error("A linked wallet is required to authorize this CCTP batch recovery.");
              const message = buildTransactionAuthorizationMessage({
                address,
                chainId: chainId ?? ARC_TESTNET_CHAIN_ID,
                intent: {
                  action: "bridge_batch_retry",
                  batchId: preview.bridgeBatchId,
                  operationIds,
                  nonce: crypto.randomUUID(),
                },
              });
              const signature = await signMessageAsync({ message });
              authorization = { message, signature };
            }

            const recovered = await apiFetch<{
              ok: boolean;
              batchId: string;
              results: Array<{
                operationId: string;
                state: "success" | "pending" | "error";
                sourceTxHash?: string;
                destinationTxHash?: string;
                explorerUrl?: string;
                failureReason?: string;
              }>;
              aggregate: {
                status: string;
                complete: number;
                failed: number;
                pending: number;
                queued: number;
                executing: number;
                total: number;
              };
            }>(`/v1/bridge/batches/${encodeURIComponent(preview.bridgeBatchId)}/retry`, {
              method: "POST",
              body: JSON.stringify({
                operationIds,
                ...(authorization ? { authorization } : {}),
              }),
            });
            const firstResultWithHash = recovered.results.find(
              (result) => result.destinationTxHash || result.sourceTxHash,
            );
            const firstTxHash =
              firstResultWithHash?.destinationTxHash ?? firstResultWithHash?.sourceTxHash;
            const firstExplorerUrl = recovered.results.find((result) => result.explorerUrl)?.explorerUrl;
            const aggregate = recovered.aggregate;
            const pendingCount = aggregate.pending + aggregate.queued + aggregate.executing;
            const progress = `${aggregate.complete} of ${aggregate.total} settled${pendingCount ? `, ${pendingCount} pending` : ""}${aggregate.failed ? `, ${aggregate.failed} failed` : ""}.`;

            if (aggregate.status === "FAILED") {
              const reason =
                recovered.results.find((result) => result.failureReason)?.failureReason ??
                `The batch recovery finished with ${aggregate.failed} failed legs.`;
              failExecution(txId, reason, firstTxHash, {
                bridgeBatchId: recovered.batchId,
              });
              pushActivity(activityBase, {
                status: "failed",
                txHash: firstTxHash,
                explorerUrl: firstExplorerUrl,
                failureReason: reason,
              });
              return;
            }

            const allSettled = aggregate.status === "COMPLETE";
            const partial = aggregate.failed > 0;
            updateTxCard({
              ...pendingRecord,
              status: allSettled ? "settled" : partial ? "partial" : "pending",
              txHash: firstTxHash,
              explorerUrl: firstExplorerUrl,
              transferId: recovered.batchId,
              operationKind: "bridge",
              pendingReason: allSettled ? undefined : progress,
              failureReason: partial ? progress : undefined,
            });
            pushActivity(activityBase, {
              status: allSettled ? "settled" : partial ? "partial" : "pending",
              txHash: firstTxHash,
              explorerUrl: firstExplorerUrl,
              failureReason: partial ? progress : undefined,
            });
            completeExecution(allSettled ? firstTxHash : undefined, txId, {
              outcome: allSettled ? "settled" : partial ? "partial" : "pending",
              settledCount: aggregate.complete,
              pendingCount,
              failedCount: aggregate.failed,
              totalCount: aggregate.total,
              bridgeBatchId: recovered.batchId,
            });
            notifyUsageRefresh();
            return;
          } catch (error) {
            const reason = humanizeTxFailure(error);
            failExecution(txId, reason, undefined, {
              bridgeBatchId: preview.bridgeBatchId,
            });
            pushActivity(activityBase, { status: "failed", failureReason: reason });
            return;
          }
        }
        const idempotencyKey = crypto.randomUUID();
        try {
          let authorization: { message: string; signature: string } | undefined;
          if (needsWalletSignature) {
            if (!address) throw new Error("A linked wallet is required to authorize this CCTP batch.");
            const message = buildTransactionAuthorizationMessage({
              address,
              chainId: chainId ?? ARC_TESTNET_CHAIN_ID,
              intent: {
                action: "bridge_batch",
                sourceChain: "Arc_Testnet",
                destinationChain: preview.destinationChain,
                recipients: bridgeBatch,
                idempotencyKey,
                nonce: crypto.randomUUID(),
              },
            });
            const signature = await signMessageAsync({ message });
            authorization = { message, signature };
          }

          const created = await apiFetch<{
            ok: true;
            batchId: string;
            operations: Array<{
              id: string;
              recipientAddress: string;
              amount: string;
              destinationChain: string;
              status: string;
            }>;
          }>("/v1/bridge/batches", {
            method: "POST",
            body: JSON.stringify({
              destinationChain: preview.destinationChain,
              recipients: bridgeBatch,
              idempotencyKey,
              ...(authorization ? { authorization } : {}),
            }),
          });

          let settledCount = 0;
          let pendingCount = 0;
          let failedCount = 0;
          let firstTxHash: string | undefined;
          let firstExplorerUrl: string | undefined;
          let firstFailure: string | undefined;
          for (const operation of created.operations) {
            try {
              const result = await apiFetch<{
                ok: boolean;
                state: "success" | "pending" | "error";
                sourceTxHash?: string;
                destinationTxHash?: string;
                explorerUrl?: string;
                failureReason?: string;
              }>(
                `/v1/bridge/batches/${encodeURIComponent(created.batchId)}/operations/${encodeURIComponent(operation.id)}/execute`,
                { method: "POST" },
              );
              const legHash = result.destinationTxHash ?? result.sourceTxHash;
              firstTxHash ??= legHash;
              firstExplorerUrl ??= result.explorerUrl;
              if (result.ok && result.state === "success") settledCount += 1;
              else if (result.ok && result.state === "pending") pendingCount += 1;
              else {
                failedCount += 1;
                firstFailure ??= result.failureReason;
              }
            } catch (error) {
              failedCount += 1;
              firstFailure ??= humanizeTxFailure(error);
            }
          }

          if (failedCount === created.operations.length) {
            const reason = firstFailure ?? "Every CCTP bridge leg failed.";
            failExecution(txId, reason, firstTxHash, {
              bridgeBatchId: created.batchId,
            });
            pushActivity(activityBase, {
              status: "failed",
              txHash: firstTxHash,
              explorerUrl: firstExplorerUrl,
              failureReason: reason,
            });
            return;
          }

          const allSettled = settledCount === created.operations.length;
          const progress = `${settledCount} of ${created.operations.length} settled${pendingCount ? `, ${pendingCount} pending` : ""}${failedCount ? `, ${failedCount} failed` : ""}.`;
          updateTxCard({
            ...pendingRecord,
            status: allSettled ? "settled" : failedCount ? "partial" : "pending",
            txHash: firstTxHash,
            explorerUrl: firstExplorerUrl,
            transferId: created.batchId,
            operationKind: "bridge",
            pendingReason: allSettled
              ? undefined
              : `${progress} Only failed or pending CCTP legs need further action.`,
          });
          pushActivity(activityBase, {
            status: allSettled ? "settled" : failedCount ? "partial" : "pending",
            txHash: firstTxHash,
            explorerUrl: firstExplorerUrl,
            failureReason: failedCount ? progress : undefined,
          });
          completeExecution(
            allSettled ? firstTxHash : undefined,
            txId,
            {
              outcome: allSettled ? "settled" : failedCount ? "partial" : "pending",
              settledCount,
              pendingCount,
              failedCount,
              totalCount: created.operations.length,
              bridgeBatchId: created.batchId,
            },
          );
          notifyUsageRefresh();
          return;
        } catch (error) {
          const reason = humanizeTxFailure(error);
          failExecution(txId, reason);
          pushActivity(activityBase, { status: "failed", failureReason: reason });
          return;
        }
      }
      if (!preview.destinationChain || !/^0x[a-fA-F0-9]{40}$/.test(preview.recipient)) {
        const reason = "A CCTP transfer needs a supported destination chain and a full EVM recipient address.";
        failExecution(txId, reason);
        pushActivity(activityBase, { status: "failed", failureReason: reason });
        return;
      }
      const idempotencyKey = crypto.randomUUID();
      try {
        let authorization: { message: string; signature: string } | undefined;
        if (needsWalletSignature) {
          if (!address) throw new Error("A linked wallet is required to authorize this CCTP transfer.");
          const message = buildTransactionAuthorizationMessage({
            address,
            chainId: chainId ?? ARC_TESTNET_CHAIN_ID,
            intent: preview.bridgeOperationId
              ? {
                  action: "bridge_retry",
                  operationId: preview.bridgeOperationId,
                  nonce: crypto.randomUUID(),
                }
              : {
                  action: "bridge",
                  sourceChain: "Arc_Testnet",
                  destinationChain: preview.destinationChain,
                  recipientAddress: preview.recipient,
                  amount: preview.amount,
                  idempotencyKey,
                  nonce: crypto.randomUUID(),
                },
          });
          const signature = await signMessageAsync({ message });
          authorization = { message, signature };
        }

        const response = await apiFetch<{
          ok: boolean;
          operationId: string;
          state: "success" | "pending" | "error";
          sourceTxHash?: string;
          destinationTxHash?: string;
          explorerUrl?: string;
          failureReason?: string;
          recoverable?: boolean;
        }>(
          preview.bridgeOperationId
            ? `/v1/bridge/${encodeURIComponent(preview.bridgeOperationId)}/retry`
            : "/v1/bridge",
          {
            method: "POST",
            body: JSON.stringify(
              preview.bridgeOperationId
                ? { ...(authorization ? { authorization } : {}) }
                : {
                    destinationChain: preview.destinationChain,
                    recipientAddress: preview.recipient,
                    amount: preview.amount,
                    idempotencyKey,
                    ...(authorization ? { authorization } : {}),
                  },
            ),
          },
        );

        const txHash = response.destinationTxHash ?? response.sourceTxHash;
        if (!response.ok || response.state === "error") {
          const reason = response.failureReason ?? "The CCTP transfer didn't complete.";
          failExecution(
            txId,
            reason,
            txHash,
            response.recoverable ? { bridgeOperationId: response.operationId } : undefined,
          );
          pushActivity(activityBase, {
            status: "failed",
            txHash,
            explorerUrl: response.explorerUrl,
            failureReason: reason,
          });
          return;
        }

        updateTxCard({
          ...pendingRecord,
          status: response.state === "success" ? "settled" : "pending",
          txHash,
          explorerUrl: response.explorerUrl,
          transferId: response.operationId,
          operationKind: "bridge",
          pendingReason:
            response.state === "pending"
              ? "CCTP is waiting for attestation or destination mint confirmation."
              : undefined,
        });
        pushActivity(activityBase, {
          status: response.state === "success" ? "settled" : "pending",
          txHash,
          explorerUrl: response.explorerUrl,
        });
        completeExecution(
          response.state === "success" ? txHash : undefined,
          txId,
          response.state === "pending" ? { outcome: "pending" } : undefined,
        );
        notifyUsageRefresh();
        return;
      } catch (error) {
        const details =
          error instanceof ApiError && error.details && typeof error.details === "object"
            ? (error.details as {
                operationId?: string;
                recoverable?: boolean;
                sourceTxHash?: string;
                destinationTxHash?: string;
                failureReason?: string;
                message?: string;
              })
            : null;
        const reason = details?.failureReason ?? details?.message ?? humanizeTxFailure(error);
        const txHash = details?.destinationTxHash ?? details?.sourceTxHash;
        failExecution(
          txId,
          reason,
          txHash,
          details?.recoverable && details.operationId
            ? { bridgeOperationId: details.operationId }
            : undefined,
        );
        pushActivity(activityBase, { status: "failed", txHash, failureReason: reason });
        return;
      }
    }

    // Circle App Kit swap path (server-side /v1/swap)
    if (isSwap) {
      const tokenIn = preview.action === "swapUSDCtoEURC" ? "USDC" : "EURC";
      const tokenOut = preview.action === "swapUSDCtoEURC" ? "EURC" : "USDC";
      try {
        let authorization: { message: string; signature: string } | undefined;
        if (needsWalletSignature) {
          if (!address) throw new Error("A linked wallet is required for this swap.");
          const message = buildTransactionAuthorizationMessage({
            address,
            chainId: chainId ?? ARC_TESTNET_CHAIN_ID,
            intent: {
              action: "swap",
              tokenIn,
              tokenOut,
              amountIn: preview.amount,
              nonce: crypto.randomUUID(),
            },
          });
          const signature = await signMessageAsync({ message });
          authorization = { message, signature };
        }
        const res = await apiFetch<{
          ok: boolean;
          code?: string;
          message?: string;
          txHash?: string;
          explorerUrl?: string;
          amountOut?: string;
        }>("/v1/swap", {
          method: "POST",
          body: JSON.stringify({
            tokenIn,
            tokenOut,
            amountIn: preview.amount,
            ...(authorization ? { authorization } : {}),
          }),
        });

        if (!res.ok) {
          const reason = res.message ?? res.code ?? "Swap failed";
          failExecution(txId, reason);
          pushActivity(activityBase, {
            status: "failed",
            failureReason: reason,
          });
          return;
        }

        const settled = {
          ...pendingRecord,
          status: "settled" as const,
          txHash: res.txHash,
          explorerUrl: res.explorerUrl,
          operationKind: "swap" as const,
          outputAmount: res.amountOut,
          outputAsset: tokenOut,
        };
        updateTxCard(settled);
        pushActivity(activityBase, {
          status: "settled",
          txHash: res.txHash,
          explorerUrl: res.explorerUrl,
        });
        completeExecution(res.txHash, txId);
        notifyUsageRefresh();
        return;
      } catch (err) {
        const reason = humanizeTxFailure(err);
        failExecution(txId, reason);
        pushActivity(activityBase, { status: "failed", failureReason: reason });
        return;
      }
    }

    // Map the account placeholder to the active external or managed smart wallet.
    const activeWalletAddress = needsWalletSignature ? address : smartWalletAddress;
    const recipientForResolve =
      /^your wallet$/i.test(preview.recipient.trim()) && activeWalletAddress
        ? activeWalletAddress
        : preview.recipient;

    const built = buildRemitTargets({
      batch: preview.batch,
      recipient: recipientForResolve,
      amount: isCompound ? (preview.totalAmount ?? "") : preview.amount,
    });

    if (!built.ok) {
      failExecution(txId, built.reason);
      pushActivity(activityBase, { status: "failed", failureReason: built.reason });
      return;
    }

    const targets: RemitTarget[] = built.targets.slice(0, MAX_REMIT_RECIPIENTS);
    if (targets.length === 0) {
      const reason =
        "Recipient must be a full EVM address (0x…) or email. Names alone cannot be settled on-chain yet.";
      failExecution(txId, reason);
      pushActivity(activityBase, { status: "failed", failureReason: reason });
      return;
    }

    const sendAsset = isCompound ? preview.receiveAsset! : preview.asset;
    const authorizedTargets = targets.map((target) => ({
      target,
      request: {
        recipient: target.payload,
        amount: target.amount,
        asset: sendAsset,
        idempotencyKey: crypto.randomUUID(),
      } satisfies RemitRequest,
    }));

    if (isCompound) {
      const tokenIn = preview.asset as "USDC" | "EURC";
      const tokenOut = preview.receiveAsset as "USDC" | "EURC";
      try {
        let authorization: { message: string; signature: string } | undefined;
        if (needsWalletSignature) {
          if (!address) throw new Error("A linked wallet is required for this plan.");
          const message = buildTransactionAuthorizationMessage({
            address,
            chainId: chainId ?? ARC_TESTNET_CHAIN_ID,
            intent: {
              action: "swap_and_send",
              tokenIn,
              tokenOut,
              amountIn: preview.amount,
              requests: authorizedTargets.map(({ request }) => request),
              nonce: crypto.randomUUID(),
            },
          });
          const signature = await signMessageAsync({ message });
          authorization = { message, signature };
        }
        const response = await apiFetch<{
          ok: true;
          swap: { txHash?: string; explorerUrl?: string; amountOut?: string };
          remittances: Array<{
            transferId: string | null;
            approvalId?: string;
            state: string;
            txHash?: string;
            explorerUrl?: string;
            reason?: string;
          }>;
        }>("/v1/swap-and-send", {
          method: "POST",
          body: JSON.stringify({
            tokenIn,
            tokenOut,
            amountIn: preview.amount,
            requests: authorizedTargets.map(({ request }) => request),
            ...(authorization ? { authorization } : {}),
          }),
        });

        let pendingCount = 0;
        let failedCount = 0;
        let settledCount = 0;
        let lastHash = response.swap.txHash;
        response.remittances.forEach((result, index) => {
          const target = targets[index];
          const isSettled = result.state === "SETTLED" || result.state === "INCLUDED";
          const isFailed = ["FAILED", "POLICY_DENIED", "REJECTED", "EXPIRED"].includes(
            result.state,
          );
          const status = isSettled ? "settled" : isFailed ? "failed" : "pending";
          if (status === "settled") settledCount += 1;
          else if (status === "failed") failedCount += 1;
          else pendingCount += 1;
          lastHash = result.txHash ?? lastHash;
          const legId = `${txId}_leg${index + 1}`;
          const legRecord: TransactionRecord = {
            id: legId,
            status,
            asset: tokenOut,
            amount: target.amount,
            recipient: target.label,
            txHash: result.txHash,
            explorerUrl: result.explorerUrl,
            network: preview.network,
            timestamp: Date.now(),
            failureReason: result.reason,
            transferId: result.transferId ?? undefined,
            approvalId: result.approvalId,
            operationKind: "swap_and_send",
          };
          updateTxCard(legRecord);
          pushActivity(legRecord, {
            status,
            txHash: result.txHash,
            explorerUrl: result.explorerUrl,
            failureReason: result.reason,
          });
        });

        if (failedCount > 0) {
          const reason = `The swap settled, but ${failedCount} of ${targets.length} payment legs failed. ${settledCount} settled and ${pendingCount} are pending.`;
          updateTxCard({
            ...pendingRecord,
            status: "partial",
            txHash: response.swap.txHash,
            explorerUrl: response.swap.explorerUrl,
            failureReason: reason,
            operationKind: "swap_and_send",
            outputAmount: response.swap.amountOut,
            outputAsset: tokenOut,
          });
          pushActivity(activityBase, {
            status: "partial",
            txHash: response.swap.txHash,
            explorerUrl: response.swap.explorerUrl,
            failureReason: reason,
          });
          completeExecution(response.swap.txHash, txId, {
            outcome: "partial",
            settledCount,
            pendingCount,
            failedCount,
            totalCount: targets.length,
          });
        } else if (pendingCount > 0) {
          updateTxCard({
            ...pendingRecord,
            status: "pending",
            txHash: response.swap.txHash,
            explorerUrl: response.swap.explorerUrl,
            operationKind: "swap_and_send",
            outputAmount: response.swap.amountOut,
            outputAsset: tokenOut,
          });
          pushActivity(activityBase, {
            status: "pending",
            txHash: response.swap.txHash,
            explorerUrl: response.swap.explorerUrl,
          });
          completeExecution(undefined, undefined, {
            outcome: settledCount > 0 ? "partial" : "pending",
            settledCount,
            pendingCount,
            failedCount,
            totalCount: targets.length,
          });
        } else {
          updateTxCard({
            ...pendingRecord,
            status: "settled",
            txHash: lastHash,
            explorerUrl: response.swap.explorerUrl,
            operationKind: "swap_and_send",
            outputAmount: response.swap.amountOut,
            outputAsset: tokenOut,
          });
          pushActivity(activityBase, {
            status: "settled",
            txHash: lastHash,
            explorerUrl: response.swap.explorerUrl,
          });
          completeExecution(lastHash, txId);
        }
        notifyUsageRefresh();
        return;
      } catch (error) {
        const reason = humanizeTxFailure(error);
        failExecution(txId, reason);
        pushActivity(activityBase, { status: "failed", failureReason: reason });
        return;
      }
    }

    let remitAuthorization: { message: string; signature: string } | undefined;
    if (needsWalletSignature) {
      try {
        if (!address) throw new Error("A linked wallet is required for this remittance.");
        const message = buildTransactionAuthorizationMessage({
          address,
          chainId: chainId ?? ARC_TESTNET_CHAIN_ID,
          intent: {
            action: "remit",
            requests: authorizedTargets.map(({ request }) => request),
          },
        });
        const signature = await signMessageAsync({ message });
        remitAuthorization = { message, signature };
      } catch (err) {
        const reason = humanizeTxFailure(err);
        failExecution(txId, reason);
        pushActivity(activityBase, { status: "failed", failureReason: reason });
        return;
      }
    }

    const executeOneRemit = async (
      target: RemitTarget,
      request: RemitRequest,
      oneTxId: string,
    ): Promise<{
      ok: boolean;
      txHash?: string;
      explorerUrl?: string;
      reason?: string;
      transferId?: string;
      pending?: boolean;
      approvalPending?: boolean;
    }> => {
      const oneBase = {
        id: oneTxId,
        asset: preview.asset,
        amount: target.amount,
        recipient: target.label,
        network: preview.network,
        timestamp: Date.now(),
      };
      updateTxCard({
        id: oneTxId,
        status: "pending",
        asset: preview.asset,
        amount: target.amount,
        recipient: target.label,
        network: preview.network,
        timestamp: oneBase.timestamp,
      });
      pushActivity(oneBase, { status: "pending" });

      try {
        const res = await apiFetch<{
          transferId: string;
          approvalId?: string;
          state: string;
          txHash?: string;
          explorerUrl?: string;
          message?: string;
        }>("/v1/remit", {
          method: "POST",
          body: JSON.stringify({
            ...request,
            execute: true,
            ...(remitAuthorization ? { authorization: remitAuthorization } : {}),
          }),
        });

        if (res.state === "PENDING_APPROVAL") {
          const pendingReason = "Waiting for the recipient to approve this Coretta-to-Coretta payment.";
          pushActivity(oneBase, { status: "pending" });
          updateTxCard({
            id: oneTxId,
            status: "pending",
            asset: preview.asset,
            amount: target.amount,
            recipient: target.label,
            network: preview.network,
            timestamp: oneBase.timestamp,
            transferId: res.transferId,
            approvalId: res.approvalId,
            pendingReason,
          });
          void monitorTransferAfterApproval(res.transferId, oneTxId, oneBase);
          return {
            ok: true,
            pending: true,
            approvalPending: true,
            transferId: res.transferId,
          };
        }

        if (res.state === "SETTLED" || res.state === "INCLUDED") {
          pushActivity(oneBase, {
            status: "settled",
            txHash: res.txHash,
            explorerUrl: res.explorerUrl,
          });
          updateTxCard({
            id: oneTxId,
            status: "settled",
            asset: preview.asset,
            amount: target.amount,
            recipient: target.label,
            network: preview.network,
            timestamp: oneBase.timestamp,
            txHash: res.txHash,
            explorerUrl: res.explorerUrl,
          });
          return {
            ok: true,
            txHash: res.txHash,
            explorerUrl: res.explorerUrl,
            transferId: res.transferId,
          };
        }

        if (["FAILED", "POLICY_DENIED", "REJECTED", "EXPIRED"].includes(res.state)) {
          const reason = humanizeTxFailure(new Error(res.message ?? res.state));
          pushActivity(oneBase, {
            status: "failed",
            txHash: res.txHash,
            explorerUrl: res.explorerUrl,
            failureReason: reason,
          });
          updateTxCard({
            id: oneTxId,
            status: "failed",
            asset: preview.asset,
            amount: target.amount,
            recipient: target.label,
            network: preview.network,
            timestamp: oneBase.timestamp,
            txHash: res.txHash,
            failureReason: reason,
          });
          return { ok: false, reason, txHash: res.txHash };
        }

        // Non-terminal: poll until settled/failed
        pushActivity(oneBase, {
          status: "pending",
          txHash: res.txHash,
          explorerUrl: res.explorerUrl,
        });
        updateTxCard({
          id: oneTxId,
          status: "pending",
          asset: preview.asset,
          amount: target.amount,
          recipient: target.label,
          network: preview.network,
          timestamp: oneBase.timestamp,
          txHash: res.txHash,
          explorerUrl: res.explorerUrl,
        });

        for (let i = 0; i < 45; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const t = await apiFetch<{
              state: string;
              txHash?: string;
              failureReason?: string;
              explorerUrl?: string;
            }>(`/v1/transfers/${res.transferId}`);
            const lifecycle = mapTransferStateToLifecycle(t.state);
            if (lifecycle === "pending") continue;
            if (lifecycle === "settled") {
              pushActivity(oneBase, {
                status: "settled",
                txHash: t.txHash,
                explorerUrl: t.explorerUrl,
              });
              updateTxCard({
                id: oneTxId,
                status: "settled",
                asset: preview.asset,
                amount: target.amount,
                recipient: target.label,
                network: preview.network,
                timestamp: oneBase.timestamp,
                txHash: t.txHash,
                explorerUrl: t.explorerUrl,
              });
              return {
                ok: true,
                txHash: t.txHash,
                explorerUrl: t.explorerUrl,
                transferId: res.transferId,
              };
            }
            const reason = t.failureReason
              ? humanizeTxFailure(new Error(t.failureReason))
              : humanizeTxFailure(new Error(t.state));
            pushActivity(oneBase, {
              status: "failed",
              txHash: t.txHash,
              failureReason: reason,
            });
            updateTxCard({
              id: oneTxId,
              status: "failed",
              asset: preview.asset,
              amount: target.amount,
              recipient: target.label,
              network: preview.network,
              timestamp: oneBase.timestamp,
              txHash: t.txHash,
              failureReason: reason,
            });
            return { ok: false, reason, txHash: t.txHash };
          } catch {
            /* retry poll */
          }
        }
        const pendingReason =
          "Transfer submitted. Circle confirmation is still being tracked in Activity.";
        pushActivity(oneBase, { status: "pending" });
        updateTxCard({
          id: oneTxId,
          status: "pending",
          asset: preview.asset,
          amount: target.amount,
          recipient: target.label,
          network: preview.network,
          timestamp: oneBase.timestamp,
        });
        void track({
          kind: "transfer",
          label: pendingReason,
          status: "pending",
          metadata: { transferId: res.transferId, recipient: target.label },
        });
        return { ok: true, pending: true, transferId: res.transferId };
      } catch (err) {
        const reason = humanizeTxFailure(err);
        pushActivity(oneBase, { status: "failed", failureReason: reason });
        updateTxCard({
          id: oneTxId,
          status: "failed",
          asset: preview.asset,
          amount: target.amount,
          recipient: target.label,
          network: preview.network,
          timestamp: Date.now(),
          failureReason: reason,
        });
        return { ok: false, reason };
      }
    };

    // Multi-wallet: sequential remits (API is single-recipient). Max 10.
    if (targets.length > 1) {
      // Aggregate status card while legs run (per-wallet cards use `${txId}_wN`).
      updateTxCard({
        id: txId,
        status: "pending",
        asset: preview.asset,
        amount: preview.totalAmount ?? preview.amount,
        recipient: `${targets.length} wallets`,
        network: preview.network,
        timestamp: pendingRecord.timestamp,
      });

      void track({
        kind: "transfer",
        label: `Batch send ${targets.length} wallets · ${preview.amount} ${preview.asset}`,
        status: "pending",
        metadata: {
          recipients: targets.map((t) => t.label),
          amounts: targets.map((t) => t.amount),
          count: targets.length,
        },
      });

      try {
        await apiFetch("/v1/usage/track", {
          method: "POST",
          body: JSON.stringify({
            action: "batch",
            ...(needsWalletSignature && address ? { walletAddress: address } : {}),
          }),
        });
      } catch {
        /* non-fatal */
      }

      let settledCount = 0;
      let pendingCount = 0;
      let failedCount = 0;
      let lastHash: string | undefined;
      const failures: string[] = [];

      for (let i = 0; i < targets.length; i++) {
        const { target, request } = authorizedTargets[i];
        const oneTxId = `${txId}_w${i + 1}`;
        const result = await executeOneRemit(target, request, oneTxId);
        if (result.pending) {
          pendingCount += 1;
        } else if (result.ok) {
          settledCount += 1;
          lastHash = result.txHash ?? lastHash;
        } else {
          failedCount += 1;
          const short =
            target.label.length > 14
              ? `${target.label.slice(0, 8)}…${target.label.slice(-4)}`
              : target.label;
          failures.push(`${short}: ${result.reason ?? "failed"}`);
        }
        updateTxCard({
          id: txId,
          status: "pending",
          asset: preview.asset,
          amount: preview.totalAmount ?? preview.amount,
          recipient: `${i + 1}/${targets.length} processed`,
          network: preview.network,
          timestamp: pendingRecord.timestamp,
          txHash: lastHash,
          pendingReason: `${settledCount} settled, ${pendingCount} pending, ${failedCount} failed.`,
          operationKind: "batch",
        });
      }

      notifyUsageRefresh();

      if (failedCount === 0 && pendingCount === 0) {
        updateTxCard({
          id: txId,
          status: "settled",
          asset: preview.asset,
          amount: preview.totalAmount ?? preview.amount,
          recipient: `${settledCount} wallets`,
          network: preview.network,
          timestamp: Date.now(),
          txHash: lastHash,
        });
        completeExecution(lastHash, txId);
        void track({
          kind: "transfer",
          label: `Batch settled ${settledCount}/${targets.length}`,
          status: "complete",
          metadata: { settledCount, failedCount },
        });
        return;
      }

      if (pendingCount > 0) {
        updateTxCard({
          id: txId,
          status: "pending",
          asset: preview.asset,
          amount: preview.totalAmount ?? preview.amount,
          recipient: `${settledCount} settled · ${pendingCount} pending`,
          network: preview.network,
          timestamp: Date.now(),
          txHash: lastHash,
        });
        completeExecution(undefined, undefined, {
          outcome: settledCount > 0 || failedCount > 0 ? "partial" : "pending",
          settledCount,
          pendingCount,
          failedCount,
          totalCount: targets.length,
        });
        void track({
          kind: "transfer",
          label: `Batch submitted: ${settledCount} settled, ${pendingCount} pending, ${failedCount} failed`,
          status: "pending",
          metadata: { settledCount, pendingCount, failedCount, failures },
        });
        return;
      }

      if (settledCount === 0) {
        failExecution(
          txId,
          `All ${failedCount} transfers failed. ${failures.slice(0, 3).join(" · ")}`,
        );
        return;
      }

      // Partial success
      updateTxCard({
        id: txId,
        status: "partial",
        asset: preview.asset,
        amount: preview.totalAmount ?? preview.amount,
        recipient: `${settledCount}/${targets.length} wallets`,
        network: preview.network,
        timestamp: Date.now(),
        txHash: lastHash,
        failureReason: `${failedCount} failed: ${failures.slice(0, 2).join(" · ")}`,
      });
      completeExecution(lastHash, txId, {
        outcome: "partial",
        settledCount,
        pendingCount,
        failedCount,
        totalCount: targets.length,
      });
      void track({
        kind: "transfer",
        label: `Batch partial ${settledCount}/${targets.length}`,
        status: "complete",
        metadata: { settledCount, failedCount, failures },
      });
      return;
    }

    // For one recipient, executeOneRemit owns the same transaction card and activity record.
    const only = authorizedTargets[0];
    const result = await executeOneRemit(only.target, only.request, txId);
    if (result.pending) {
      completeExecution(undefined, txId, {
        outcome: result.approvalPending ? "approval_pending" : "pending",
      });
      notifyUsageRefresh();
      return;
    }
    if (result.ok) {
      completeExecution(result.txHash, txId, { transferId: result.transferId });
      notifyUsageRefresh();
      return;
    }
    failExecution(txId, result.reason ?? "Transfer failed.", result.txHash);
    notifyUsageRefresh();
  };

  const activeOrb = listening || phase === "thinking" || executionsInFlight > 0;
  const processing = phase === "thinking";
  const latestUserMessage = messages.slice().reverse().find((message) => message.role === "user")?.content;

  const showPreview =
    Boolean(preview) &&
    (phase === "preview" || phase === "awaiting_signature");

  const openReceipt = (id: string) => {
    setReceipt(
      txCards.find((record) => record.id === id) ??
        getTransactions().find((record) => record.id === id) ??
        null,
    );
  };

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col bg-[#F5F5F5] text-black">
      <ChatHistoryDrawer
        open={historyOpen}
        conversations={conversations}
        activeId={conversationId}
        onClose={() => setHistoryOpen(false)}
        onNew={() => void startNewConversation()}
        onLoad={(id) => void loadConversation(id)}
        onArchive={(id) => void archiveConversation(id)}
      />
      <div className="flex items-center gap-3 border-b border-black/10 bg-white px-5 py-3">
        <AIOrb active={activeOrb} size="sm" animation="pulse" className="shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black">
            {AGENT_NAME}
          </p>
          <p className="subheading-text mt-0.5 flex items-center gap-1.5 truncate text-xs text-black/50">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#16C784]" aria-hidden="true" />
            Online
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void refreshConversations();
              setHistoryOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black hover:border-black/25"
            aria-label="Open conversation history"
          >
            <History className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">History</span>
          </button>
          <ReportIssueButton conversationId={conversationId} lastUserMessage={latestUserMessage} />
        </div>
      </div>

      {isConnected && needsWalletSignature && !verified && (
        <div className="mx-4 mb-2 rounded-2xl border border-black/10 bg-white px-3 py-2 text-xs text-black/80 shadow-sm">
          {verifying
            ? "Confirm ownership in your wallet"
            : verifyError
              ? verifyError
              : "Wallet connected. One ownership signature activates your session."}
          {!verifying && (
            <button
              type="button"
              className="ml-2 font-semibold text-black underline underline-offset-2 hover:text-black/70"
              onClick={() => void verifyOwnership()}
            >
              Sign now
            </button>
          )}
        </div>
      )}

      {isConnected && needsWalletSignature && verified && !smartWalletActive && (
        <SmartWalletActivation
          onActivate={() => void activateSmartWallet()}
          activating={activating}
        />
      )}

      {needsWalletSignature && isBoundMismatch && (
        <div className="mx-4 mb-2 rounded-2xl border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Connected wallet does not match your bound wallet. Replace your wallet in Settings to
          continue.
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-3 p-4 md:p-6">
          {messages.map((m, index) => {
            const previous = messages[index - 1];
            const grouped = Boolean(
              previous &&
                previous.role === m.role &&
                m.timestamp - previous.timestamp < 2 * 60 * 1000,
            );
            return (
              <ChatBubble
                key={m.id}
                message={m}
                grouped={grouped}
                onViewReceipt={openReceipt}
                onApprovalDecision={(id, decision) => void decideIncomingApproval(id, decision)}
              />
            );
          })}
          {phase === "thinking" && (
            <div className="flex items-center gap-1.5 px-2 py-2 text-xs text-black/45" role="status" aria-live="polite">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-black/50 motion-reduce:animate-none" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-black/50 [animation-delay:120ms] motion-reduce:animate-none" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-black/50 [animation-delay:240ms] motion-reduce:animate-none" />
              <span className="ml-1">Damian is thinking</span>
            </div>
          )}
          {txCards.map((r) => (
            <TransactionStatusCard
              key={r.id}
              record={r}
              onDismiss={dismissTxCard}
              onViewReceipt={openReceipt}
            />
          ))}
          {showPreview && preview && (
            <TransactionPreviewCard
              preview={preview}
              phase={phase}
              onConfirm={handleConfirm}
              onCancel={cancelPreview}
              connected={identityConnected}
              walletConnected={isConnected}
              canTransact={canTransact}
              requiresWalletSignature={needsWalletSignature}
              ownershipVerified={emailOnlyMode || verified}
              smartWalletActive={smartWalletActive}
            />
          )}
        </div>
      </div>

      {voiceDraft && (
        <div className="mx-4 mb-2 rounded-2xl border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Voice captured. Review and press Send to continue. Voice never auto-sends.
        </div>
      )}

      <form onSubmit={handleSubmit} className="px-4 pb-2">
        <div className="mx-auto flex max-w-3xl gap-2 rounded-full border border-black/10 bg-[#FAFAFA] p-1.5 transition focus-within:border-black/30">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("askDamian")}
            disabled={
              phase === "awaiting_signature" ||
              (isConnected && needsWalletSignature && !canTransact)
            }
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-black placeholder:text-black/35 outline-none"
          />
          {supported && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 w-10 shrink-0 rounded-full p-0 text-black/60 hover:text-black"
              onClick={() => (listening ? stopListening() : startListening())}
              aria-label={listening ? "Stop listening" : "Voice input"}
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            size="sm"
            className="h-10 w-10 shrink-0 rounded-xl p-0"
            disabled={processing || !input.trim() || phase === "awaiting_signature"}
            aria-label={processing ? "Damian is processing" : "Send message"}
          >
            {processing ? (
              <Square className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
      <TransactionReceiptModal record={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
