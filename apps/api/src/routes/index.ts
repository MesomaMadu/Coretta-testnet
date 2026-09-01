import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@coretta/db";
import {
  ARC_EXPLORER,
  DEFAULT_DAILY_SEND_LIMIT_MICRO,
  DEFAULT_DAILY_TX_LIMIT,
  MAX_BATCH_RECIPIENTS,
  MAX_TRANSFER_MICRO,
  CCTP_EVM_TESTNET_DESTINATIONS,
  CCTP_SOURCE_CHAIN,
  isCctpEvmTestnetChainId,
  formatMicroToUsdc,
  parseUsdcToMicro,
} from "@coretta/shared";
import {
  invalidateSessionsForUser,
  resolveSession,
} from "../services/auth.js";
import {
  createRemittance,
  executeRemittance,
  refreshCircleRemittance,
} from "../services/orchestrator.js";
import {
  getWalletBalanceMicro,
  getWalletEurcBalanceMicro,
  findUserByIdentity,
  ensureCircleScaDeployed,
} from "../services/wallet.js";
import {
  activateSmartWallet,
  bindPrimaryWallet,
  getWalletBindingStatus,
} from "../services/wallet-binding.js";
import { createAuditEvent } from "../services/audit.js";
import { touchPresence, getActiveCount } from "../services/presence.js";
import { estimateTokenSwap, executeTokenSwap } from "../services/swap.js";
import { log } from "../lib/log.js";
import {
  createConversation,
  createFeedback,
  createMessage,
  deleteMemory,
  ensureDefaultPreferences,
  getOrCreateActorForUser,
  getConversationMessages,
  getPreferences,
  listConversations,
  listMemories,
  retrieveMemories,
  setPreference,
  setConversationStatus,
  clearMemories,
} from "../services/ai.js";
import {
  forgetSavedRecipient,
  listSavedRecipients,
  resolveSavedRecipient,
  saveRecipient,
  updateSavedRecipient,
} from "../services/saved-recipients.js";
import {
  getLastSettledTransfer,
  HISTORY_PERIODS,
  resolveHistoryPeriod,
  searchUserTransfers,
  settledTransferStates,
  sumSettledTransfersTo,
} from "../services/damian-history.js";
import {
  generateDamianConversationReply,
  isDamianModelConfigured,
} from "../services/damian-conversation.js";

import {
  anonymousUsageMetrics,
  consumeAiRequestQuota,
  consumeSwapRequestQuota,
  getUserUsageMetrics,
  getWalletUsageMetrics,
  trackUsageEvent,
} from "../services/limits.js";
import { determineOptimalRoute } from "../services/router.js";
import {
  authenticateWalletOwnership,
  linkWalletIdentity,
} from "../services/wallet-auth.js";
import {
  authenticatePrivyEmail,
  inspectPrivyEmailAccount,
  isPrivyConnectivityError,
  isPrivyConfigured,
} from "../services/privy.js";
import {
  authorizeRemit,
  authorizeBridge,
  authorizeBridgeBatch,
  authorizeBridgeBatchRetry,
  authorizeBridgeRetry,
  authorizeSwap,
  authorizeSwapAndSend,
  requiresWalletTransactionAuthorization,
} from "../services/transaction-auth.js";
import {
  listWalletInteractions,
  recordWalletInteraction,
} from "../services/wallet-interactions.js";
import { normalizeWalletAddress } from "@coretta/shared";
import { assessDamianInputSecurity } from "@coretta/shared/damian-security";
import { shouldResetDailyLimits } from "../services/policy.js";
import {
  acceptApproval,
  listApprovalsForUser,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  queueRecipientApproval,
  rejectApproval,
} from "../services/approvals.js";
import {
  estimateCctpBridge,
  estimateCctpBridgeBatch,
  executeCctpBridge,
  getCctpWalletBalances,
  listCctpEvmTestnetDestinations,
  parseBridgeResult,
  retryCctpBridge,
  serializeBridgeResult,
  summarizeBridgeResult,
} from "../services/cctp.js";
import { assessEvmRecipient } from "../services/address-risk.js";
import {
  ensureCircleScaDestination,
  isCircleScaCctpDestination,
} from "../services/circle.js";

const transactionAuthorizationSchema = z.object({
  message: z.string().min(100).max(20_000),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/).min(100).max(300),
});

const TRANSIENT_DATABASE_ERROR =
  /P1001|P1002|P1017|Can't reach database server|connection pool|timed out fetching|ECONNRESET|ETIMEDOUT|ENOTFOUND/i;

const PREFERRED_NAME_EDIT_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

const cctpDestinationSchema = z.string().refine(isCctpEvmTestnetChainId, {
  message: "Unsupported CCTP EVM testnet destination.",
});

const cctpBridgeRequestSchema = z.object({
  destinationChain: cctpDestinationSchema,
  recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string().regex(/^\d+(?:\.\d{1,6})?$/),
});

const cctpBridgeBatchRequestSchema = z.object({
  destinationChain: cctpDestinationSchema,
  recipients: z
    .array(
      z.object({
        recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        amount: z.string().regex(/^\d+(?:\.\d{1,6})?$/),
        destinationChain: cctpDestinationSchema.optional(),
      }),
    )
    .min(2)
    .max(MAX_BATCH_RECIPIENTS),
});

function validateCctpAmount(amount: string) {
  const micro = parseUsdcToMicro(amount);
  if (micro <= 0n) throw new Error("INVALID_AMOUNT");
  if (micro > MAX_TRANSFER_MICRO) throw new Error("AMOUNT_EXCEEDS_MAX");
  return micro;
}

function isOwnSmartWalletRecipient(
  smartWalletAddress: string,
  recipientAddress: string,
) {
  return smartWalletAddress.toLowerCase() === recipientAddress.toLowerCase();
}

const SMART_WALLET_CCTP_DESTINATION_MESSAGE =
  "Your Coretta smart wallet can receive on Arbitrum Sepolia, Avalanche Fuji, Base Sepolia, Ethereum Sepolia, Monad Testnet, OP Sepolia, Polygon Amoy, and Unichain Sepolia. Use a verified external EVM address for the other supported CCTP destinations.";

type CctpBatchRecipient = {
  recipientAddress: string;
  amount: string;
  destinationChain: (typeof CCTP_EVM_TESTNET_DESTINATIONS)[number]["id"];
};

function normalizeCctpBatchRecipients(
  defaultDestination: CctpBatchRecipient["destinationChain"],
  recipients: Array<{
    recipientAddress: string;
    amount: string;
    destinationChain?: CctpBatchRecipient["destinationChain"];
  }>,
): CctpBatchRecipient[] {
  return recipients.map((recipient) => ({
    ...recipient,
    destinationChain: recipient.destinationChain ?? defaultDestination,
  }));
}

function validateCctpBatch(
  recipients: CctpBatchRecipient[],
) {
  const normalized = recipients.map(
    (recipient) =>
      `${recipient.destinationChain}:${recipient.recipientAddress.toLowerCase()}`,
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("DUPLICATE_RECIPIENT");
  }
  const totalMicro = recipients.reduce(
    (total, recipient) => total + validateCctpAmount(recipient.amount),
    0n,
  );
  if (totalMicro > MAX_TRANSFER_MICRO) throw new Error("AMOUNT_EXCEEDS_MAX");
  return { totalMicro, totalAmount: formatMicroToUsdc(totalMicro) };
}

async function refreshBridgeBatchStatus(batchId: string) {
  const operations = await prisma.bridgeOperation.findMany({
    where: { batchId },
    select: { status: true, failureReason: true },
  });
  const complete = operations.filter((operation) => operation.status === "COMPLETE").length;
  const failed = operations.filter((operation) => operation.status === "FAILED").length;
  const pending = operations.filter((operation) => operation.status === "PENDING").length;
  const queued = operations.filter((operation) => operation.status === "QUEUED").length;
  const executing = operations.filter((operation) => operation.status === "EXECUTING").length;
  const status =
    complete === operations.length
      ? "COMPLETE"
      : failed === operations.length
        ? "FAILED"
        : failed > 0 && complete + pending + queued + executing > 0
          ? "PARTIAL"
          : pending > 0 && queued + executing === 0
            ? "PENDING"
            : "EXECUTING";
  const failureReason =
    failed > 0
      ? `${failed} of ${operations.length} bridge legs failed. Retry only the failed legs.`
      : null;
  await prisma.bridgeBatch.update({
    where: { id: batchId },
    data: { status, failureReason },
  });
  return { status, complete, failed, pending, queued, executing, total: operations.length };
}

function preferredNameState(user: {
  preferredName: string | null;
  preferredNameUpdatedAt: Date | null;
}) {
  const nextEditAt = user.preferredNameUpdatedAt
    ? new Date(user.preferredNameUpdatedAt.getTime() + PREFERRED_NAME_EDIT_INTERVAL_MS)
    : null;
  const canEditPreferredName = !user.preferredName || !nextEditAt || nextEditAt <= new Date();

  return {
    preferredName: user.preferredName ?? "",
    preferredNameUpdatedAt: user.preferredNameUpdatedAt?.toISOString() ?? null,
    nextPreferredNameEditAt: nextEditAt?.toISOString() ?? null,
    canEditPreferredName,
  };
}

async function retryDatabaseOperation<T>(operation: () => Promise<T>): Promise<T> {
  const attempts = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!TRANSIENT_DATABASE_ERROR.test(message) || attempt === attempts - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
    }
  }

  throw lastError;
}

async function readWithinDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("BALANCE_READ_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true, service: "coretta-api" }));

  app.get("/health/database", async (_req, reply) => {
    try {
      await retryDatabaseOperation(() => prisma.$queryRawUnsafe("SELECT 1"));
      return reply.send({ ok: true, database: "reachable" });
    } catch (error) {
      log.error("database", "Database health check failed", {
        message: error instanceof Error ? error.message : "DATABASE_UNAVAILABLE",
      });
      return reply.code(503).send({
        ok: false,
        database: "unavailable",
        code: "DATABASE_UNAVAILABLE",
      });
    }
  });

  app.get("/v1/auth/email-status", async (_req, reply) => {
    const configured = isPrivyConfigured();
    return reply.send({
      configured,
      provider: "Privy",
      fromAddress: null,
      devMode: process.env.DEV_MODE !== "false",
      reason: configured
        ? null
        : "Set PRIVY_APP_ID and PRIVY_APP_SECRET on the API, plus NEXT_PUBLIC_PRIVY_APP_ID on the Next app.",
    });
  });

  app.get("/v1/auth/wallet-status", async (req, reply) => {
    try {
      const query = z
        .object({ address: z.string().regex(/^0x[a-fA-F0-9]{40}$/) })
        .parse(req.query);
      const user = await retryDatabaseOperation(() =>
        findUserByIdentity("wallet", query.address),
      );
      return reply.send({
        existing: Boolean(user?.wallets[0]),
        smartWalletAddress: user?.wallets[0]?.scaAddress ?? null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) throw error;
      log.error("auth", "Wallet onboarding status check failed", {
        message: error instanceof Error ? error.message : "WALLET_STATUS_FAILED",
      });
      return reply.code(503).send({
        code: "DATABASE_UNAVAILABLE",
        message: "Coretta could not check this wallet account. Please retry.",
      });
    }
  });

  app.post("/v1/auth/privy/status", async (req, reply) => {
    if (!isPrivyConfigured()) {
      return reply.code(503).send({
        code: "PRIVY_NOT_CONFIGURED",
        message: "Privy email authentication is not configured on the API.",
      });
    }
    const header = req.headers.authorization;
    const accessToken = header?.startsWith("Bearer ") ? header.slice(7) : "";
    if (!accessToken) {
      return reply.code(401).send({
        code: "PRIVY_TOKEN_MISSING",
        message: "A Privy access token is required.",
      });
    }
    try {
      return reply.send(
        await retryDatabaseOperation(() => inspectPrivyEmailAccount(accessToken)),
      );
    } catch (error) {
      const code = error instanceof Error ? error.message : "PRIVY_AUTH_FAILED";
      log.error("auth", "Privy onboarding status check failed", { message: code });
      if (/P1001|P1002|database server|connection pool|timed out fetching/i.test(code)) {
        return reply.code(503).send({
          code: "DATABASE_UNAVAILABLE",
          message: "Coretta could not check this email account. Please retry.",
        });
      }
      if (isPrivyConnectivityError(error)) {
        return reply.code(503).send({
          code: "PRIVY_UNAVAILABLE",
          message: "Coretta could not reach Privy to verify this login session.",
        });
      }
      return reply.code(401).send({
        code: code === "PRIVY_EMAIL_REQUIRED" ? code : "PRIVY_AUTH_FAILED",
        message: "Privy could not verify this login session.",
      });
    }
  });

  app.post("/v1/auth/privy", async (req, reply) => {
    if (!isPrivyConfigured()) {
      return reply.code(503).send({
        code: "PRIVY_NOT_CONFIGURED",
        message: "Privy email authentication is not configured on the API.",
      });
    }

    const header = req.headers.authorization;
    const accessToken = header?.startsWith("Bearer ") ? header.slice(7) : "";
    if (!accessToken) {
      return reply.code(401).send({
        code: "PRIVY_TOKEN_MISSING",
        message: "A Privy access token is required.",
      });
    }

    const { linkToWallet } = z
      .object({ linkToWallet: z.boolean().optional().default(false) })
      .parse(req.body ?? {});

    const corettaHeader = req.headers["x-coretta-session"];
    const corettaToken = Array.isArray(corettaHeader)
      ? corettaHeader[0]
      : corettaHeader;
    let existingUser: Awaited<ReturnType<typeof resolveSession>> = null;
    if (corettaToken) {
      try {
        existingUser = await resolveSession(`Bearer ${corettaToken}`);
      } catch (error) {
        log.error("auth", "Coretta wallet session lookup failed during Privy auth", {
          message: error instanceof Error ? error.message : "SESSION_LOOKUP_FAILED",
        });
        return reply.code(503).send({
          code: "DATABASE_UNAVAILABLE",
          message: "Coretta could not verify the existing wallet session. Please retry.",
        });
      }
    }
    if (linkToWallet && !existingUser) {
      return reply.code(401).send({
        code: "CORETTA_WALLET_SESSION_REQUIRED",
        message: "Verify the connected wallet before linking an email.",
      });
    }

    try {
      const result = await authenticatePrivyEmail(accessToken, existingUser?.id);
      const wallet = result.user.wallets[0];
      const metrics = await getUserUsageMetrics(result.user.id);
      return reply.send({
        token: result.token,
        expiresAt: result.expiresAt.toISOString(),
        email: result.email,
        smartWalletAddress: wallet?.scaAddress ?? null,
        metrics,
        user: {
          id: result.user.id,
          walletAddress: wallet?.scaAddress ?? null,
          identities: result.user.identities.map((identity) => ({
            type: identity.type,
            value: identity.normalizedValue,
          })),
        },
      });
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : "PRIVY_AUTH_FAILED";
      log.error("auth", "Privy authentication exchange failed", {
        message: errorCode,
      });
      if (errorCode === "EMAIL_ALREADY_LINKED") {
        return reply.code(409).send({
          code: errorCode,
          message: "This verified email is already linked to another Coretta account.",
        });
      }
      if (errorCode === "PRIVY_EMAIL_REQUIRED") {
        return reply.code(422).send({
          code: errorCode,
          message: "The Privy account does not contain a verified email.",
        });
      }
      if (/P1001|P1002|database server|connection pool|timed out fetching/i.test(errorCode)) {
        return reply.code(503).send({
          code: "DATABASE_UNAVAILABLE",
          message: "Coretta could not save the verified email. Please retry.",
        });
      }
      if (isPrivyConnectivityError(error)) {
        return reply.code(503).send({
          code: "PRIVY_UNAVAILABLE",
          message: "Coretta could not reach Privy to verify this login session.",
        });
      }
      if (/Circle|wallet set|entity secret|createWallet/i.test(errorCode)) {
        return reply.code(502).send({
          code: "WALLET_PROVISIONING_FAILED",
          message: "The email was verified, but the smart wallet could not be prepared.",
        });
      }
      return reply.code(401).send({
        code: "PRIVY_AUTH_FAILED",
        message: "Privy could not verify this login session.",
      });
    }
  });

  app.get("/v1/user/usage", async (req, reply) => {
    let user;
    try {
      user = await retryDatabaseOperation(() =>
        resolveSession(req.headers.authorization),
      );
    } catch (error) {
      log.error("database", "Session lookup could not reach the account database", {
        url: req.url,
        method: req.method,
        message: error instanceof Error ? error.message : "DATABASE_UNAVAILABLE",
      });
      return reply.code(503).send({
        code: "DATABASE_UNAVAILABLE",
        message: "Coretta could not reach its account database. Please retry in a moment.",
      });
    }
    const query = (req.query ?? {}) as { walletAddress?: string };
    let walletAddress: string | null = null;
    if (query.walletAddress) {
      try {
        walletAddress = normalizeWalletAddress(query.walletAddress);
      } catch {
        return reply.code(400).send({
          code: "INVALID_WALLET_ADDRESS",
          message: "walletAddress must be a 0x-prefixed 40-hex EOA.",
        });
      }
    }

    if (walletAddress) {
      if (!user) {
        return reply.code(401).send({
          code: "UNAUTHORIZED",
          message: "Sign ownership to view live wallet usage.",
        });
      }
      const walletIdentity = user.identities.find((i) => i.type === "wallet");
      const allowed =
        walletIdentity?.normalizedValue === walletAddress ||
        user.wallets.some(
          (w) =>
            w.ownerAddress?.toLowerCase() === walletAddress ||
            w.scaAddress.toLowerCase() === walletAddress,
        );
      if (!allowed) {
        return reply.code(403).send({
          code: "WALLET_NOT_LINKED",
          message: "This session is not authorized for that wallet address.",
        });
      }
      const metrics = await getWalletUsageMetrics(walletAddress, user);
      return reply.send(metrics);
    }

    if (!user) {
      return reply.send(anonymousUsageMetrics());
    }
    const metrics = await getUserUsageMetrics(user.id);
    return reply.send(metrics);
  });

  app.get("/v1/routes/estimate", async (req, reply) => {
    const query = (req.query ?? {}) as { asset?: string; amount?: string; networkId?: string };
    const user = await resolveSession(req.headers.authorization);
    const route = await determineOptimalRoute({
      senderUserId: user?.id,
      senderAsset: query.asset ?? "USDC",
      recipientAsset: query.asset ?? "USDC",
      targetNetworkId: query.networkId,
      amount: query.amount ?? "100.00",
    });
    return reply.send(route);
  });

  app.post("/v1/presence/ping", async (req, reply) => {
    const body = z.object({ sessionId: z.string().min(8).max(64) }).parse(req.body);
    const count = touchPresence(body.sessionId);
    return reply.send({ activeUsers: count });
  });

  app.get("/v1/presence/active", async (_req, reply) => {
    return reply.send({ activeUsers: getActiveCount() });
  });

  app.post("/v1/auth/otp/send", async (_req, reply) => {
    return reply.code(410).send({
      code: "PRIVY_CLIENT_AUTH_REQUIRED",
      message: "Email codes are sent by Privy's browser SDK. Use POST /v1/auth/privy after Privy login.",
    });
  });

  app.post("/v1/auth/otp/verify", async (_req, reply) => {
    return reply.code(410).send({
      code: "PRIVY_CLIENT_AUTH_REQUIRED",
      message: "Email codes are verified by Privy's browser SDK. Use POST /v1/auth/privy after Privy login.",
    });
  });

  app.post("/v1/usage/track", async (req, reply) => {
    const user = await resolveSession(req.headers.authorization);
    if (!user) return reply.send({ ok: false, reason: "UNAUTHENTICATED" });

    const body = z
      .object({
        action: z.enum([
          "voice",
          "swap",
          "simulation",
          "batch",
          "connection_attempt",
          "signature_request",
        ]),
        walletAddress: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/)
          .optional(),
      })
      .parse(req.body);

    const walletAddress =
      body.walletAddress?.toLowerCase() ??
      user.identities.find((i) => i.type === "wallet")?.normalizedValue ??
      null;

    const keyMap = {
      voice: "voiceRequestCount",
      swap: "swapRequestCount",
      simulation: "txSimulationCount",
      batch: "batchTxCount",
      connection_attempt: "connectionCount",
      signature_request: "signatureRequestCount",
    } as const;

    await trackUsageEvent({
      walletAddress,
      userId: user.id,
      key: keyMap[body.action],
    });

    if (body.action === "connection_attempt" || body.action === "signature_request") {
      await createAuditEvent({
        actorId: user.id,
        action:
          body.action === "connection_attempt"
            ? "WALLET_CONNECT_ATTEMPT"
            : "OWNERSHIP_SIGNATURE_REQUEST",
        metadata: walletAddress ? { walletAddress } : undefined,
      });
    }

    const metrics = walletAddress
      ? await getWalletUsageMetrics(walletAddress, user)
      : await getUserUsageMetrics(user.id);

    return reply.send({ ok: true, metrics });
  });

  app.post("/v1/auth/wallet", async (req, reply) => {
    const body = z
      .object({
        address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        message: z.string().min(32).max(2000),
        signature: z.string().min(80).max(200),
      })
      .parse(req.body);

    try {
      const result = await authenticateWalletOwnership(body);
      const metrics = await getWalletUsageMetrics(result.walletAddress, result.user);
      const wallet = result.user.wallets[0];
      return reply.send({
        token: result.token,
        expiresAt: result.expiresAt.toISOString(),
        walletAddress: result.walletAddress,
        smartWalletAddress: result.smartWalletAddress ?? wallet?.scaAddress ?? null,
        smartWalletActivated: result.smartWalletActivated ?? true,
        boundPrimaryWallet: result.boundPrimaryWallet ?? result.walletAddress,
        metrics,
        user: {
          id: result.user.id,
          walletAddress: wallet?.scaAddress,
          identities: result.user.identities.map((i) => ({
            type: i.type,
            value: i.normalizedValue,
          })),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "WALLET_AUTH_FAILED";
      // Connectivity / unreachable DB (not every Prisma validation error).
      if (
        /Unable to open the database file|Can't reach database server|P1001|P1017|P1003|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(
          message,
        )
      ) {
        log.error("auth", "Wallet auth database error", { message });
        return reply.code(503).send({
          code: "DATABASE_UNAVAILABLE",
          message:
            "Database unavailable. Check DATABASE_URL reachability (Supabase session pooler :5432 or direct host) and restart the API.",
        });
      }
      const status =
        message === "INVALID_SIGNATURE" ||
        message === "INVALID_OWNERSHIP_MESSAGE" ||
        message === "ADDRESS_MISMATCH" ||
        message === "WRONG_CHAIN" ||
        message === "MESSAGE_EXPIRED"
          ? 401
          : 400;
      return reply.code(status).send({
        code: message.slice(0, 80),
        message:
          status === 401
            ? message
            : message.includes("prisma")
              ? "Database error during wallet login"
              : message,
      });
    }
  });

  app.post("/v1/auth/login", async (_req, reply) => {
    return reply.code(410).send({
      code: "EMAIL_AUTH_DISABLED",
      message: "Email/phone login is temporarily disabled. Use POST /v1/auth/wallet.",
    });
  });

  app.addHook("preHandler", async (req, reply) => {
    if (
      req.url.startsWith("/health") ||
      req.url.startsWith("/v1/auth/") ||
      req.url.startsWith("/v1/presence/") ||
      req.url.startsWith("/v1/user/usage") ||
      req.url.startsWith("/v1/routes/estimate") ||
      req.method === "OPTIONS"
    ) {
      return;
    }
    let user;
    try {
      user = await retryDatabaseOperation(() =>
        resolveSession(req.headers.authorization),
      );
    } catch (error) {
      log.error("database", "Authenticated request could not reach the account database", {
        url: req.url,
        method: req.method,
        message: error instanceof Error ? error.message : "DATABASE_UNAVAILABLE",
      });
      return reply.code(503).send({
        code: "DATABASE_UNAVAILABLE",
        message: "Coretta could not reach its account database. Please retry in a moment.",
      });
    }
    if (!user) {
      return reply.code(401).send({ code: "UNAUTHORIZED", message: "Invalid session" });
    }
    req.user = user;
  });

  app.get("/v1/me", async (req) => {
    const user = req.user!;
    const wallet = user.wallets[0];
    let balanceMicro = 0n;
    let balanceEurcMicro = 0n;
    if (wallet) {
      try {
        [balanceMicro, balanceEurcMicro] = await readWithinDeadline(
          Promise.all([
            getWalletBalanceMicro(wallet.scaAddress as `0x${string}`),
            getWalletEurcBalanceMicro(wallet.scaAddress as `0x${string}`),
          ]),
          3_500,
        );
      } catch (error) {
        log.warn("wallet", "Arc balances are temporarily unavailable", {
          message: error instanceof Error ? error.message : "BALANCE_READ_FAILED",
        });
      }
    }
    const binding = await getWalletBindingStatus(user.id);
    return {
      id: user.id,
      walletAddress: wallet?.scaAddress,
      balanceUsdc: formatMicroToUsdc(balanceMicro),
      balanceEurc: formatMicroToUsdc(balanceEurcMicro),
      balanceMicro: balanceMicro.toString(),
      balanceEurcMicro: balanceEurcMicro.toString(),
      identities: user.identities.map((i) => ({
        type: i.type,
        value: i.normalizedValue,
      })),
      ...preferredNameState(user),
      ...binding,
    };
  });

  app.get("/v1/me/profile", async (req) => {
    return preferredNameState(req.user!);
  });

  app.patch("/v1/me/profile", async (req, reply) => {
    const user = req.user!;
    const { preferredName } = z
      .object({ preferredName: z.string().trim().min(1).max(40) })
      .parse(req.body);

    if (user.preferredName === preferredName) {
      return reply.send(preferredNameState(user));
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() - PREFERRED_NAME_EDIT_INTERVAL_MS);
    const result = await retryDatabaseOperation(() =>
      prisma.user.updateMany({
        where: {
          id: user.id,
          OR: [
            { preferredName: null },
            { preferredNameUpdatedAt: null },
            { preferredNameUpdatedAt: { lte: cutoff } },
          ],
        },
        data: { preferredName, preferredNameUpdatedAt: now },
      }),
    );

    if (result.count === 0) {
      const current = await retryDatabaseOperation(() =>
        prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
      );
      if (current.preferredName === preferredName) {
        invalidateSessionsForUser(user.id);
        return reply.send(preferredNameState(current));
      }
      const state = preferredNameState(current);
      const retryAfterSeconds = state.nextPreferredNameEditAt
        ? Math.max(
            1,
            Math.ceil(
              (new Date(state.nextPreferredNameEditAt).getTime() - Date.now()) / 1000,
            ),
          )
        : 1;
      return reply
        .header("Retry-After", retryAfterSeconds)
        .code(429)
        .send({
          code: "PREFERRED_NAME_EDIT_COOLDOWN",
          message: "You can edit your preferred name once every 14 days.",
          ...state,
        });
    }

    invalidateSessionsForUser(user.id);
    return reply.send(
      preferredNameState({ preferredName, preferredNameUpdatedAt: now }),
    );
  });

  app.get("/v1/wallet/status", async (req) => {
    const user = req.user!;
    const binding = await getWalletBindingStatus(user.id);
    const wallets = user.wallets.map((w) => ({
      scaAddress: w.scaAddress,
      vendor: w.vendor,
      counterfactual: w.counterfactual,
      vendorWalletId: w.vendorWalletId,
    }));
    return {
      ...binding,
      wallets,
      requiresWalletSignature: requiresWalletTransactionAuthorization(user),
    };
  });

  /** Deploy the caller's still-counterfactual Circle SCAs on-chain. */
  app.post("/v1/wallet/deploy", async (req, reply) => {
    const user = req.user!;
    const results: Array<{
      scaAddress: string;
      deployed: boolean;
      txHash: string | undefined;
      error: string | undefined;
      wasCounterfactual: boolean;
    }> = [];
    for (const w of user.wallets) {
      if (w.vendor === "circle_modular" && w.vendorWalletId) {
        const r = await ensureCircleScaDeployed({
          id: w.id,
          vendor: w.vendor,
          vendorWalletId: w.vendorWalletId,
          scaAddress: w.scaAddress,
          counterfactual: w.counterfactual,
        });
        results.push({
          scaAddress: w.scaAddress,
          deployed: r.deployed,
          txHash: r.txHash,
          error: r.error,
          wasCounterfactual: w.counterfactual,
        });
      }
    }
    return reply.send({ ok: true, results });
  });

  app.post("/v1/wallet/activate", async (req, reply) => {
    const user = req.user!;
    const body = z
      .object({ primaryWalletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/) })
      .parse(req.body);
    let res;
    try {
      res = await activateSmartWallet(user.id, body.primaryWalletAddress);
    } catch (error) {
      if (error instanceof Error && error.message === "WALLET_NOT_LINKED") {
        return reply.code(403).send({
          code: "WALLET_NOT_LINKED",
          message: "Verify ownership and link this wallet before activating it.",
        });
      }
      throw error;
    }
    await trackUsageEvent({
      walletAddress: body.primaryWalletAddress.toLowerCase(),
      userId: user.id,
      key: "walletCreationCount",
    });
    return res;
  });

  app.post("/v1/wallet/bind", async (req, reply) => {
    const user = req.user!;
    const body = z
      .object({ primaryWalletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/) })
      .parse(req.body);
    try {
      return await bindPrimaryWallet(user.id, body.primaryWalletAddress);
    } catch (error) {
      if (error instanceof Error && error.message === "WALLET_NOT_LINKED") {
        return reply.code(403).send({
          code: "WALLET_NOT_LINKED",
          message: "Verify ownership and link this wallet before binding it.",
        });
      }
      throw error;
    }
  });

  app.post("/v1/wallet/link-external", async (req, reply) => {
    const user = req.user!;
    const body = z
      .object({
        address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        message: z.string().min(32).max(2000),
        signature: z.string().min(80).max(200),
      })
      .parse(req.body);
    try {
      return reply.send(await linkWalletIdentity(user.id, body));
    } catch (error) {
      const code = error instanceof Error ? error.message : "WALLET_LINK_FAILED";
      const status = code === "WALLET_ALREADY_LINKED" ? 409 : 400;
      return reply.code(status).send({
        code,
        message:
          code === "WALLET_ALREADY_LINKED"
            ? "This wallet already belongs to another Coretta account."
            : "Coretta could not verify and link this wallet.",
      });
    }
  });

  /**
   * Record an app interaction for a verified wallet session.
   * Client must only call this when ownership is verified (Bearer token + wallet).
   */
  app.post("/v1/wallet/interactions", async (req, reply) => {
    const user = req.user!;
    const body = z
      .object({
        walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        kind: z.enum([
          "session",
          "chat",
          "preview",
          "transfer",
          "swap",
          "navigation",
          "signature",
          "other",
        ]),
        label: z.string().min(1).max(500),
        status: z.enum(["pending", "complete", "failed"]).optional(),
        metadata: z.record(z.unknown()).optional(),
      })
      .parse(req.body);

    const walletAddress = normalizeWalletAddress(body.walletAddress);
    const linked =
      user.identities.some(
        (i) => i.type === "wallet" && i.normalizedValue === walletAddress,
      ) ||
      user.wallets.some(
        (w) =>
          w.ownerAddress?.toLowerCase() === walletAddress ||
          w.scaAddress.toLowerCase() === walletAddress,
      );

    if (!linked) {
      return reply.code(403).send({
        code: "WALLET_NOT_LINKED",
        message: "Wallet is not linked to this session.",
      });
    }

    const row = await recordWalletInteraction({
      userId: user.id,
      walletAddress,
      kind: body.kind,
      label: body.label,
      status: body.status,
      metadata: body.metadata,
    });

    return reply.send({
      ok: true,
      interaction: {
        id: row.id,
        walletAddress: row.walletAddress,
        kind: row.kind,
        label: row.label,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      },
    });
  });

  /** Past interactions for the authenticated wallet (app history). */
  app.get("/v1/wallet/interactions", async (req, reply) => {
    const user = req.user!;
    const query = z
      .object({
        walletAddress: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/)
          .optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      })
      .parse(req.query ?? {});

    let walletAddress = query.walletAddress
      ? normalizeWalletAddress(query.walletAddress)
      : user.identities.find((i) => i.type === "wallet")?.normalizedValue ??
        null;

    if (walletAddress) {
      const linked =
        user.identities.some(
          (i) => i.type === "wallet" && i.normalizedValue === walletAddress,
        ) ||
        user.wallets.some(
          (w) =>
            w.ownerAddress?.toLowerCase() === walletAddress ||
            w.scaAddress.toLowerCase() === walletAddress,
        );
      if (!linked) {
        return reply.code(403).send({
          code: "WALLET_NOT_LINKED",
          message: "Wallet is not linked to this session.",
        });
      }
    }

    const interactions = await listWalletInteractions({
      userId: user.id,
      walletAddress,
      limit: query.limit,
    });

    return reply.send({
      walletAddress,
      interactions,
    });
  });

  app.post("/v1/wallet/rebind/send-otp", async (_req, reply) => {
    return reply.code(410).send({
      code: "EMAIL_AUTH_DISABLED",
      message: "Email-based wallet rebind is temporarily disabled. Disconnect and reconnect the new wallet, then re-verify ownership.",
    });
  });

  app.post("/v1/wallet/rebind/verify-otp", async (_req, reply) => {
    return reply.code(410).send({
      code: "EMAIL_AUTH_DISABLED",
      message: "Email-based wallet rebind is temporarily disabled.",
    });
  });

  app.post("/v1/wallet/rebind/complete", async (_req, reply) => {
    return reply.code(410).send({
      code: "EMAIL_AUTH_DISABLED",
      message:
        "Email-based wallet rebind is temporarily disabled. Disconnect, connect the new wallet, and complete ownership verification.",
    });
  });

  app.get("/v1/audit", async (req) => {
    const user = req.user!;
    const logs = await prisma.auditLog.findMany({
      where: { actorId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return logs.map((l) => ({
      id: l.id,
      action: l.action,
      metadata: l.metadata ? JSON.parse(l.metadata) : null,
      createdAt: l.createdAt.toISOString(),
    }));
  });

  app.get("/v1/recipients/lookup", async (req, reply) => {
    const q = z
      .object({
        type: z.enum(["email", "phone", "wallet"]),
        value: z.string(),
      })
      .parse(req.query);

    const user = await findUserByIdentity(q.type, q.value);
    if (!user?.wallets[0]) {
      return reply.send({ exists: false, willProvisionOnSend: true });
    }
    return reply.send({
      exists: true,
      walletAddress: user.wallets[0].scaAddress,
    });
  });

  app.get("/v1/bridge/chains", async () => ({
    sourceChain: CCTP_SOURCE_CHAIN,
    token: "USDC",
    destinations: listCctpEvmTestnetDestinations(),
  }));

  app.get("/v1/balances/chains", async (req, reply) => {
    const wallet = req.user!.wallets[0];
    if (!wallet) {
      return reply.code(404).send({
        code: "WALLET_MISSING",
        message: "No Coretta smart wallet is available for this account.",
      });
    }
    try {
      return reply.send(await getCctpWalletBalances(wallet.scaAddress));
    } catch (error) {
      log.warn("cctp", "Cross-chain balance registry failed", {
        message: error instanceof Error ? error.message : "CHAIN_BALANCES_FAILED",
      });
      return reply.code(503).send({
        code: "CHAIN_BALANCES_UNAVAILABLE",
        message: "Cross-chain balances are temporarily unavailable. Arc balances are still shown separately.",
      });
    }
  });

  app.post("/v1/security/recipients/check", async (req, reply) => {
    const body = z
      .object({
        chain: z.string().min(2).max(80),
        addresses: z
          .array(z.string().regex(/^0x[a-fA-F0-9]{40}$/))
          .min(1)
          .max(MAX_BATCH_RECIPIENTS),
      })
      .parse(req.body);
    if (
      body.chain !== CCTP_SOURCE_CHAIN &&
      !isCctpEvmTestnetChainId(body.chain)
    ) {
      return reply.code(422).send({
        code: "UNSUPPORTED_RISK_NETWORK",
        message: "Recipient checks are unavailable for that network.",
      });
    }
    const unique = [...new Set(body.addresses.map((address) => address.toLowerCase()))];
    const assessments = await Promise.all(
      unique.map((address) => assessEvmRecipient({ address, chain: body.chain })),
    );
    return reply.send({
      allowed: assessments.every((assessment) => assessment.allowed),
      assessments,
    });
  });

  app.post("/v1/bridge/batches/estimate", async (req, reply) => {
    const parsed = cctpBridgeBatchRequestSchema.parse(req.body);
    const recipients = normalizeCctpBatchRecipients(
      parsed.destinationChain,
      parsed.recipients,
    );
    let totalAmount: string;
    try {
      totalAmount = validateCctpBatch(recipients).totalAmount;
    } catch (error) {
      const code = error instanceof Error ? error.message : "INVALID_BATCH";
      return reply.code(422).send({
        code,
        message:
          code === "DUPLICATE_RECIPIENT"
            ? "Each destination wallet and network pair can appear only once in a bridge plan."
            : code === "AMOUNT_EXCEEDS_MAX"
              ? "The full CCTP batch is limited to 100 USDC."
              : "Every bridge leg needs a positive USDC amount with up to six decimals.",
      });
    }

    const user = req.user!;
    const wallet = user.wallets[0];
    if (!wallet?.vendorWalletId || wallet.vendor !== "circle_modular") {
      return reply.code(422).send({
        code: "CIRCLE_WALLET_REQUIRED",
        message: "CCTP currently requires the Coretta Circle smart wallet.",
      });
    }
    if (
      recipients.some((recipient) =>
        isOwnSmartWalletRecipient(wallet.scaAddress, recipient.recipientAddress),
      ) &&
      recipients.some(
        (recipient) =>
          isOwnSmartWalletRecipient(wallet.scaAddress, recipient.recipientAddress) &&
          !isCircleScaCctpDestination(recipient.destinationChain),
      )
    ) {
      return reply.code(422).send({
        code: "SMART_WALLET_DESTINATION_UNAVAILABLE",
        message: SMART_WALLET_CCTP_DESTINATION_MESSAGE,
      });
    }
    const assessments = await Promise.all(
      recipients.map((recipient) =>
        assessEvmRecipient({
          address: recipient.recipientAddress,
          chain: recipient.destinationChain,
        }),
      ),
    );
    const blocked = assessments.find((assessment) => !assessment.allowed);
    if (blocked) {
      return reply.code(422).send({
        code: blocked.category === "contract" ? "CONTRACT_RECIPIENT_BLOCKED" : "RECIPIENT_RISK_BLOCKED",
        message: blocked.message,
      });
    }
    try {
      const estimate = await estimateCctpBridgeBatch({
        walletAddress: wallet.scaAddress,
        recipients,
      });
      return reply.send({ ok: true, totalAmount, ...estimate });
    } catch (error) {
      log.warn("cctp", "Bridge batch estimate failed", {
        recipientCount: recipients.length,
        message: error instanceof Error ? error.message : "CCTP_BATCH_ESTIMATE_FAILED",
      });
      return reply.code(422).send({
        code: "CCTP_BATCH_ESTIMATE_FAILED",
        message: "Coretta couldn't estimate every CCTP leg. No batch preview was created.",
      });
    }
  });

  app.post("/v1/bridge/batches", async (req, reply) => {
    const parsed = cctpBridgeBatchRequestSchema
      .extend({
        idempotencyKey: z.string().uuid(),
        authorization: transactionAuthorizationSchema.optional(),
      })
      .parse(req.body);
    const recipients = normalizeCctpBatchRecipients(
      parsed.destinationChain,
      parsed.recipients,
    );
    let totalAmount: string;
    try {
      totalAmount = validateCctpBatch(recipients).totalAmount;
    } catch (error) {
      const code = error instanceof Error ? error.message : "INVALID_BATCH";
      return reply.code(422).send({
        code,
        message:
          code === "DUPLICATE_RECIPIENT"
            ? "Each destination wallet and network pair can appear only once in a bridge plan."
            : code === "AMOUNT_EXCEEDS_MAX"
              ? "The full CCTP batch is limited to 100 USDC."
              : "The bridge batch contains an invalid amount.",
      });
    }

    const user = req.user!;
    if (requiresWalletTransactionAuthorization(user)) {
      if (!parsed.authorization) {
        return reply.code(401).send({
          code: "WALLET_AUTHORIZATION_REQUIRED",
          message: "The linked wallet must authorize this full CCTP batch.",
        });
      }
      try {
        await authorizeBridgeBatch({
          user,
          ...parsed.authorization,
          sourceChain: CCTP_SOURCE_CHAIN,
          destinationChain: parsed.destinationChain,
          recipients,
          idempotencyKey: parsed.idempotencyKey,
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "TRANSACTION_UNAUTHORIZED";
        return reply.code(code === "WALLET_NOT_LINKED" ? 403 : 401).send({
          code,
          message: "The signature doesn't match every recipient, amount, and network in this CCTP batch.",
        });
      }
    }

    const wallet = user.wallets[0];
    if (!wallet?.vendorWalletId || wallet.vendor !== "circle_modular") {
      return reply.code(422).send({
        code: "CIRCLE_WALLET_REQUIRED",
        message: "CCTP currently requires the Coretta Circle smart wallet.",
      });
    }
    const existing = await prisma.bridgeBatch.findUnique({
      where: { idempotencyKey: parsed.idempotencyKey },
      include: { operations: { orderBy: { legIndex: "asc" } } },
    });
    if (existing) {
      return reply.code(409).send({
        code: "BRIDGE_BATCH_ALREADY_CREATED",
        message:
          existing.userId === user.id
            ? "This bridge batch already exists. Resume it from Activity."
            : "This idempotency key belongs to a different bridge batch.",
      });
    }
    const assessments = await Promise.all(
      recipients.map((recipient) =>
        assessEvmRecipient({
          address: recipient.recipientAddress,
          chain: recipient.destinationChain,
        }),
      ),
    );
    const blocked = assessments.find((assessment) => !assessment.allowed);
    if (blocked) {
      return reply.code(422).send({
        code: blocked.category === "contract" ? "CONTRACT_RECIPIENT_BLOCKED" : "RECIPIENT_RISK_BLOCKED",
        message: blocked.message,
      });
    }
    if (
      recipients.some((recipient) =>
        isOwnSmartWalletRecipient(wallet.scaAddress, recipient.recipientAddress),
      )
    ) {
      const ownWalletDestinations = [
        ...new Set(
          recipients
            .filter((recipient) =>
              isOwnSmartWalletRecipient(
                wallet.scaAddress,
                recipient.recipientAddress,
              ),
            )
            .map((recipient) => recipient.destinationChain),
        ),
      ];
      if (
        ownWalletDestinations.some(
          (destinationChain) =>
            !isCircleScaCctpDestination(destinationChain),
        )
      ) {
        return reply.code(422).send({
          code: "SMART_WALLET_DESTINATION_UNAVAILABLE",
          message: SMART_WALLET_CCTP_DESTINATION_MESSAGE,
        });
      }
      try {
        for (const destinationChain of ownWalletDestinations) {
          await ensureCircleScaDestination({
            vendorWalletId: wallet.vendorWalletId,
            scaAddress: wallet.scaAddress,
            destinationChain,
          });
        }
      } catch (error) {
        log.error("cctp", "Smart wallet destination derivation failed", {
          destinationChains: ownWalletDestinations,
          message: error instanceof Error ? error.message : "CIRCLE_SCA_DERIVATION_FAILED",
        });
        return reply.code(502).send({
          code: "SMART_WALLET_DERIVATION_FAILED",
          message: "Coretta couldn't prepare your smart wallet on the destination network. No bridge leg was created.",
        });
      }
    }

    const destinationChains = [
      ...new Set(recipients.map((recipient) => recipient.destinationChain)),
    ];
    const batchDestinationChain =
      destinationChains.length === 1 ? destinationChains[0] : "MULTI";

    const batch = await prisma.bridgeBatch.create({
      data: {
        userId: user.id,
        idempotencyKey: parsed.idempotencyKey,
        sourceChain: CCTP_SOURCE_CHAIN,
        destinationChain: batchDestinationChain,
        totalAmount,
        status: "QUEUED",
        operations: {
          create: recipients.map((recipient, legIndex) => ({
            userId: user.id,
            idempotencyKey: randomUUID(),
            sourceChain: CCTP_SOURCE_CHAIN,
            destinationChain: recipient.destinationChain,
            recipientAddress: recipient.recipientAddress.toLowerCase(),
            amount: recipient.amount,
            status: "QUEUED",
            legIndex,
          })),
        },
      },
      include: { operations: { orderBy: { legIndex: "asc" } } },
    });
    await createAuditEvent({
      actorId: user.id,
      action: "CCTP_BRIDGE_BATCH_CREATED",
      metadata: {
        batchId: batch.id,
        destinationChain: batch.destinationChain,
        destinationChains,
        totalAmount: batch.totalAmount,
        recipientCount: batch.operations.length,
      },
    });
    return reply.code(201).send({
      ok: true,
      batchId: batch.id,
      status: batch.status,
      destinationChain: batch.destinationChain,
      totalAmount: batch.totalAmount,
      operations: batch.operations.map((operation) => ({
        id: operation.id,
        legIndex: operation.legIndex,
        recipientAddress: operation.recipientAddress,
        amount: operation.amount,
        destinationChain: operation.destinationChain,
        status: operation.status,
      })),
    });
  });

  app.post("/v1/bridge/batches/:batchId/operations/:operationId/execute", async (req, reply) => {
    const params = z
      .object({ batchId: z.string().min(8).max(120), operationId: z.string().min(8).max(120) })
      .parse(req.params);
    const user = req.user!;
    const operation = await prisma.bridgeOperation.findFirst({
      where: {
        id: params.operationId,
        batchId: params.batchId,
        userId: user.id,
      },
    });
    if (!operation) return reply.code(404).send({ code: "BRIDGE_BATCH_LEG_NOT_FOUND" });
    if (operation.status !== "QUEUED") {
      return reply.code(409).send({
        code: "BRIDGE_BATCH_LEG_ALREADY_STARTED",
        message: "This bridge leg was already started. Check the batch status before retrying.",
      });
    }
    const wallet = user.wallets[0];
    if (!wallet?.vendorWalletId || wallet.vendor !== "circle_modular") {
      return reply.code(422).send({ code: "CIRCLE_WALLET_REQUIRED" });
    }
    const assessment = await assessEvmRecipient({
      address: operation.recipientAddress,
      chain: operation.destinationChain,
    });
    if (!assessment.allowed) {
      await prisma.bridgeOperation.update({
        where: { id: operation.id },
        data: { status: "FAILED", failureReason: assessment.message },
      });
      const aggregate = await refreshBridgeBatchStatus(params.batchId);
      return reply.code(422).send({
        ok: false,
        operationId: operation.id,
        code: "RECIPIENT_RISK_BLOCKED",
        message: assessment.message,
        aggregate,
      });
    }
    if (isOwnSmartWalletRecipient(wallet.scaAddress, operation.recipientAddress)) {
      if (
        !isCctpEvmTestnetChainId(operation.destinationChain) ||
        !isCircleScaCctpDestination(operation.destinationChain)
      ) {
        return reply.code(422).send({
          code: "SMART_WALLET_DESTINATION_UNAVAILABLE",
          message: SMART_WALLET_CCTP_DESTINATION_MESSAGE,
        });
      }
      try {
        await ensureCircleScaDestination({
          vendorWalletId: wallet.vendorWalletId,
          scaAddress: wallet.scaAddress,
          destinationChain: operation.destinationChain,
        });
      } catch (error) {
        log.error("cctp", "Queued smart wallet destination derivation failed", {
          destinationChain: operation.destinationChain,
          message: error instanceof Error ? error.message : "CIRCLE_SCA_DERIVATION_FAILED",
        });
        return reply.code(502).send({
          code: "SMART_WALLET_DERIVATION_FAILED",
          message: "Coretta couldn't prepare your smart wallet on the destination network. This bridge leg remains queued.",
        });
      }
    }
    const claimed = await prisma.bridgeOperation.updateMany({
      where: { id: operation.id, status: "QUEUED" },
      data: { status: "EXECUTING", failureReason: null },
    });
    if (claimed.count !== 1) {
      return reply.code(409).send({
        code: "BRIDGE_BATCH_LEG_ALREADY_STARTED",
        message: "This bridge leg was already claimed by another request.",
      });
    }
    await prisma.bridgeBatch.update({
      where: { id: params.batchId },
      data: { status: "EXECUTING", failureReason: null },
    });

    try {
      const result = await executeCctpBridge({
        walletAddress: wallet.scaAddress,
        destinationChain: operation.destinationChain as typeof CCTP_EVM_TESTNET_DESTINATIONS[number]["id"],
        recipientAddress: operation.recipientAddress,
        amount: operation.amount,
      });
      const summary = summarizeBridgeResult(result);
      const status =
        summary.state === "success" ? "COMPLETE" : summary.state === "error" ? "FAILED" : "PENDING";
      await prisma.bridgeOperation.update({
        where: { id: operation.id },
        data: {
          status,
          resultJson: serializeBridgeResult(result),
          sourceTxHash: summary.sourceTxHash,
          destinationTxHash: summary.destinationTxHash,
          failureReason: summary.failureReason,
        },
      });
      const aggregate = await refreshBridgeBatchStatus(params.batchId);
      return reply.code(status === "COMPLETE" ? 200 : status === "PENDING" ? 202 : 422).send({
        ok: status !== "FAILED",
        batchId: params.batchId,
        operationId: operation.id,
        recipientAddress: operation.recipientAddress,
        amount: operation.amount,
        ...summary,
        aggregate,
      });
    } catch (error) {
      const failureReason =
        error instanceof Error
          ? error.message
          : "The CCTP bridge leg failed before Circle returned recoverable data.";
      await prisma.bridgeOperation.update({
        where: { id: operation.id },
        data: { status: "FAILED", failureReason },
      });
      const aggregate = await refreshBridgeBatchStatus(params.batchId);
      return reply.code(502).send({
        ok: false,
        batchId: params.batchId,
        operationId: operation.id,
        recoverable: false,
        failureReason,
        aggregate,
      });
    }
  });

  app.get("/v1/bridge/batches/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().min(8).max(120) }).parse(req.params);
    const batch = await prisma.bridgeBatch.findFirst({
      where: { id, userId: req.user!.id },
      include: { operations: { orderBy: { legIndex: "asc" } } },
    });
    if (!batch) return reply.code(404).send({ code: "BRIDGE_BATCH_NOT_FOUND" });
    return reply.send({
      id: batch.id,
      status: batch.status,
      sourceChain: batch.sourceChain,
      destinationChain: batch.destinationChain,
      totalAmount: batch.totalAmount,
      failureReason: batch.failureReason,
      operations: batch.operations.map((operation) => ({
        id: operation.id,
        legIndex: operation.legIndex,
        recipientAddress: operation.recipientAddress,
        amount: operation.amount,
        destinationChain: operation.destinationChain,
        status: operation.status,
        sourceTxHash: operation.sourceTxHash,
        destinationTxHash: operation.destinationTxHash,
        failureReason: operation.failureReason,
        recoverable: operation.status === "FAILED" && Boolean(operation.resultJson),
      })),
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
    });
  });

  app.post("/v1/bridge/batches/:id/retry", async (req, reply) => {
    const { id } = z.object({ id: z.string().min(8).max(120) }).parse(req.params);
    const body = z
      .object({
        operationIds: z.array(z.string().min(8).max(120)).min(1).max(MAX_BATCH_RECIPIENTS),
        authorization: transactionAuthorizationSchema.optional(),
      })
      .parse(req.body ?? {});
    if (new Set(body.operationIds).size !== body.operationIds.length) {
      return reply.code(422).send({
        code: "DUPLICATE_BRIDGE_OPERATION",
        message: "Each failed CCTP leg can be retried only once in this request.",
      });
    }

    const user = req.user!;
    const batch = await prisma.bridgeBatch.findFirst({
      where: { id, userId: user.id },
      include: { operations: { orderBy: { legIndex: "asc" } } },
    });
    if (!batch) return reply.code(404).send({ code: "BRIDGE_BATCH_NOT_FOUND" });
    const operationsById = new Map(batch.operations.map((operation) => [operation.id, operation]));
    const operations = body.operationIds.flatMap((operationId) => {
      const operation = operationsById.get(operationId);
      return operation ? [operation] : [];
    });
    if (operations.length !== body.operationIds.length) {
      return reply.code(422).send({
        code: "BRIDGE_BATCH_LEG_MISMATCH",
        message: "One requested operation doesn't belong to this CCTP batch.",
      });
    }
    const unrecoverable = operations.filter(
      (operation) => operation.status !== "FAILED" || !operation.resultJson,
    );
    if (unrecoverable.length > 0) {
      return reply.code(409).send({
        code: "BRIDGE_BATCH_LEG_NOT_RECOVERABLE",
        message:
          "Only failed legs with recorded Circle recovery data can be resumed. Create a new preview for any leg without recovery data.",
        operationIds: unrecoverable.map((operation) => operation.id),
      });
    }

    if (requiresWalletTransactionAuthorization(user)) {
      if (!body.authorization) {
        return reply.code(401).send({ code: "WALLET_AUTHORIZATION_REQUIRED" });
      }
      try {
        await authorizeBridgeBatchRetry({
          user,
          ...body.authorization,
          batchId: id,
          operationIds: body.operationIds,
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "TRANSACTION_UNAUTHORIZED";
        return reply.code(code === "WALLET_NOT_LINKED" ? 403 : 401).send({
          code,
          message: "The signature doesn't authorize these exact failed CCTP legs.",
        });
      }
    }

    const assessments = await Promise.all(
      operations.map((operation) =>
        assessEvmRecipient({
          address: operation.recipientAddress,
          chain: operation.destinationChain,
        }),
      ),
    );
    const blocked = assessments.find((assessment) => !assessment.allowed);
    if (blocked) {
      return reply.code(422).send({
        code: "RECIPIENT_RISK_BLOCKED",
        message: blocked.message,
      });
    }
    const wallet = user.wallets[0];
    if (!wallet?.vendorWalletId || wallet.vendor !== "circle_modular") {
      return reply.code(422).send({ code: "CIRCLE_WALLET_REQUIRED" });
    }
    if (
      operations.some((operation) =>
        isOwnSmartWalletRecipient(wallet.scaAddress, operation.recipientAddress),
      )
    ) {
      const ownWalletDestinations = [
        ...new Set(
          operations
            .filter((operation) =>
              isOwnSmartWalletRecipient(
                wallet.scaAddress,
                operation.recipientAddress,
              ),
            )
            .map((operation) => operation.destinationChain),
        ),
      ];
      if (
        ownWalletDestinations.some(
          (destinationChain) =>
            !isCctpEvmTestnetChainId(destinationChain) ||
            !isCircleScaCctpDestination(destinationChain),
        )
      ) {
        return reply.code(422).send({
          code: "SMART_WALLET_DESTINATION_UNAVAILABLE",
          message: SMART_WALLET_CCTP_DESTINATION_MESSAGE,
        });
      }
      try {
        for (const destinationChain of ownWalletDestinations) {
          if (!isCctpEvmTestnetChainId(destinationChain)) continue;
          await ensureCircleScaDestination({
            vendorWalletId: wallet.vendorWalletId,
            scaAddress: wallet.scaAddress,
            destinationChain,
          });
        }
      } catch (error) {
        log.error("cctp", "Batch retry smart wallet derivation failed", {
          destinationChains: ownWalletDestinations,
          message: error instanceof Error ? error.message : "CIRCLE_SCA_DERIVATION_FAILED",
        });
        return reply.code(502).send({
          code: "SMART_WALLET_DERIVATION_FAILED",
          message: "Coretta couldn't prepare your smart wallet on the destination network. No failed leg was retried.",
        });
      }
    }

    const results: Array<{
      operationId: string;
      state: "success" | "pending" | "error";
      sourceTxHash?: string;
      destinationTxHash?: string;
      explorerUrl?: string;
      failureReason?: string;
    }> = [];
    for (const operation of operations) {
      const claimed = await prisma.bridgeOperation.updateMany({
        where: { id: operation.id, status: "FAILED", resultJson: { not: null } },
        data: { status: "EXECUTING", failureReason: null },
      });
      if (claimed.count !== 1) {
        results.push({
          operationId: operation.id,
          state: "error",
          failureReason: "This failed bridge leg was already claimed by another retry request.",
        });
        continue;
      }
      try {
        const result = await retryCctpBridge(parseBridgeResult(operation.resultJson!));
        const summary = summarizeBridgeResult(result);
        const status =
          summary.state === "success" ? "COMPLETE" : summary.state === "error" ? "FAILED" : "PENDING";
        await prisma.bridgeOperation.update({
          where: { id: operation.id },
          data: {
            status,
            resultJson: serializeBridgeResult(result),
            sourceTxHash: summary.sourceTxHash,
            destinationTxHash: summary.destinationTxHash,
            failureReason: summary.failureReason,
          },
        });
        results.push({ operationId: operation.id, ...summary });
      } catch {
        const failureReason = "Circle couldn't resume this recoverable CCTP leg.";
        await prisma.bridgeOperation.update({
          where: { id: operation.id },
          data: { status: "FAILED", failureReason },
        });
        results.push({ operationId: operation.id, state: "error", failureReason });
      }
    }

    const aggregate = await refreshBridgeBatchStatus(id);
    await createAuditEvent({
      actorId: user.id,
      action: "CCTP_BRIDGE_BATCH_RETRIED",
      metadata: {
        batchId: id,
        operationIds: body.operationIds,
        status: aggregate.status,
      },
    });
    return reply.code(aggregate.status === "COMPLETE" ? 200 : 202).send({
      ok: aggregate.failed === 0,
      batchId: id,
      results,
      aggregate,
    });
  });

  app.post("/v1/bridge/estimate", async (req, reply) => {
    const parsed = cctpBridgeRequestSchema.parse(req.body);
    if (!isCctpEvmTestnetChainId(parsed.destinationChain)) {
      return reply.code(422).send({ code: "CCTP_ROUTE_UNAVAILABLE" });
    }
    try {
      validateCctpAmount(parsed.amount);
    } catch (error) {
      const code = error instanceof Error ? error.message : "INVALID_AMOUNT";
      return reply.code(422).send({
        code,
        message:
          code === "AMOUNT_EXCEEDS_MAX"
            ? "A single CCTP transfer is limited to 100 USDC."
            : "Use a positive USDC amount with up to six decimals.",
      });
    }

    const user = req.user!;
    const wallet = user.wallets[0];
    if (!wallet?.vendorWalletId || wallet.vendor !== "circle_modular") {
      return reply.code(422).send({
        code: "CIRCLE_WALLET_REQUIRED",
        message: "CCTP currently requires the Coretta Circle smart wallet.",
      });
    }
    if (
      isOwnSmartWalletRecipient(wallet.scaAddress, parsed.recipientAddress) &&
      !isCircleScaCctpDestination(parsed.destinationChain)
    ) {
      return reply.code(422).send({
        code: "SMART_WALLET_DESTINATION_UNAVAILABLE",
        message: SMART_WALLET_CCTP_DESTINATION_MESSAGE,
      });
    }
    const assessment = await assessEvmRecipient({
      address: parsed.recipientAddress,
      chain: parsed.destinationChain,
    });
    if (!assessment.allowed) {
      return reply.code(422).send({
        code: assessment.category === "contract" ? "CONTRACT_RECIPIENT_BLOCKED" : "RECIPIENT_RISK_BLOCKED",
        message: assessment.message,
        assessment,
      });
    }
    try {
      const estimate = await estimateCctpBridge({
        walletAddress: wallet.scaAddress,
        destinationChain: parsed.destinationChain,
        recipientAddress: parsed.recipientAddress,
        amount: parsed.amount,
      });
      return reply.send({ ok: true, ...estimate });
    } catch (error) {
      log.warn("cctp", "Bridge estimate failed", {
        message: error instanceof Error ? error.message : "CCTP_ESTIMATE_FAILED",
      });
      return reply.code(422).send({
        code: "CCTP_ESTIMATE_FAILED",
        message: "Coretta couldn't get a CCTP fee estimate for that route. No preview was created.",
      });
    }
  });

  app.post("/v1/bridge", async (req, reply) => {
    const parsed = cctpBridgeRequestSchema
      .extend({
        idempotencyKey: z.string().uuid(),
        authorization: transactionAuthorizationSchema.optional(),
      })
      .parse(req.body);
    if (!isCctpEvmTestnetChainId(parsed.destinationChain)) {
      return reply.code(422).send({ code: "CCTP_ROUTE_UNAVAILABLE" });
    }
    try {
      validateCctpAmount(parsed.amount);
    } catch (error) {
      const code = error instanceof Error ? error.message : "INVALID_AMOUNT";
      return reply.code(422).send({
        code,
        message: code === "AMOUNT_EXCEEDS_MAX" ? "A single CCTP transfer is limited to 100 USDC." : "Invalid CCTP amount.",
      });
    }

    const user = req.user!;
    if (requiresWalletTransactionAuthorization(user)) {
      if (!parsed.authorization) {
        return reply.code(401).send({
          code: "WALLET_AUTHORIZATION_REQUIRED",
          message: "The linked wallet must authorize this CCTP transfer.",
        });
      }
      try {
        await authorizeBridge({
          user,
          ...parsed.authorization,
          sourceChain: CCTP_SOURCE_CHAIN,
          destinationChain: parsed.destinationChain,
          recipientAddress: parsed.recipientAddress,
          amount: parsed.amount,
          idempotencyKey: parsed.idempotencyKey,
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "TRANSACTION_UNAUTHORIZED";
        return reply.code(code === "WALLET_NOT_LINKED" ? 403 : 401).send({
          code,
          message: "The signature is invalid, expired, replayed, or doesn't match this CCTP transfer.",
        });
      }
    }

    const wallet = user.wallets[0];
    if (!wallet?.vendorWalletId || wallet.vendor !== "circle_modular") {
      return reply.code(422).send({
        code: "CIRCLE_WALLET_REQUIRED",
        message: "CCTP currently requires the Coretta Circle smart wallet.",
      });
    }
    const existing = await prisma.bridgeOperation.findUnique({
      where: { idempotencyKey: parsed.idempotencyKey },
    });
    if (existing) {
      return reply.code(409).send({
        code: "BRIDGE_ALREADY_SUBMITTED",
        message:
          existing.userId === user.id
            ? "This CCTP transfer was already submitted. Check Activity before trying again."
            : "This idempotency key belongs to a different operation.",
      });
    }
    const assessment = await assessEvmRecipient({
      address: parsed.recipientAddress,
      chain: parsed.destinationChain,
    });
    if (!assessment.allowed) {
      return reply.code(422).send({
        code: assessment.category === "contract" ? "CONTRACT_RECIPIENT_BLOCKED" : "RECIPIENT_RISK_BLOCKED",
        message: assessment.message,
      });
    }
    if (isOwnSmartWalletRecipient(wallet.scaAddress, parsed.recipientAddress)) {
      if (!isCircleScaCctpDestination(parsed.destinationChain)) {
        return reply.code(422).send({
          code: "SMART_WALLET_DESTINATION_UNAVAILABLE",
          message: SMART_WALLET_CCTP_DESTINATION_MESSAGE,
        });
      }
      try {
        await ensureCircleScaDestination({
          vendorWalletId: wallet.vendorWalletId,
          scaAddress: wallet.scaAddress,
          destinationChain: parsed.destinationChain,
        });
      } catch (error) {
        log.error("cctp", "Smart wallet destination derivation failed", {
          destinationChain: parsed.destinationChain,
          message: error instanceof Error ? error.message : "CIRCLE_SCA_DERIVATION_FAILED",
        });
        return reply.code(502).send({
          code: "SMART_WALLET_DERIVATION_FAILED",
          message: "Coretta couldn't prepare your smart wallet on the destination network. The CCTP transfer was not started.",
        });
      }
    }

    const operation = await prisma.bridgeOperation.create({
      data: {
        userId: user.id,
        idempotencyKey: parsed.idempotencyKey,
        sourceChain: CCTP_SOURCE_CHAIN,
        destinationChain: parsed.destinationChain,
        recipientAddress: parsed.recipientAddress.toLowerCase(),
        amount: parsed.amount,
        status: "EXECUTING",
      },
    });

    try {
      const result = await executeCctpBridge({
        walletAddress: wallet.scaAddress,
        destinationChain: parsed.destinationChain,
        recipientAddress: parsed.recipientAddress,
        amount: parsed.amount,
      });
      const summary = summarizeBridgeResult(result);
      const status = summary.state === "success" ? "COMPLETE" : summary.state === "error" ? "FAILED" : "PENDING";
      await prisma.bridgeOperation.update({
        where: { id: operation.id },
        data: {
          status,
          resultJson: serializeBridgeResult(result),
          sourceTxHash: summary.sourceTxHash,
          destinationTxHash: summary.destinationTxHash,
          failureReason: summary.failureReason,
        },
      });
      await createAuditEvent({
        actorId: user.id,
        action: status === "COMPLETE" ? "CCTP_BRIDGE_COMPLETE" : status === "FAILED" ? "CCTP_BRIDGE_FAILED" : "CCTP_BRIDGE_PENDING",
        metadata: {
          operationId: operation.id,
          destinationChain: parsed.destinationChain,
          amount: parsed.amount,
          sourceTxHash: summary.sourceTxHash,
          destinationTxHash: summary.destinationTxHash,
        },
      });
      return reply.code(status === "COMPLETE" ? 200 : status === "PENDING" ? 202 : 422).send({
        ok: status !== "FAILED",
        operationId: operation.id,
        destinationChain: parsed.destinationChain,
        amount: parsed.amount,
        ...summary,
      });
    } catch (error) {
      log.error("cctp", "Bridge execution failed before a recoverable result was returned", {
        operationId: operation.id,
        message: error instanceof Error ? error.message : "CCTP_BRIDGE_FAILED",
      });
      await prisma.bridgeOperation.update({
        where: { id: operation.id },
        data: {
          status: "FAILED",
          failureReason: "The CCTP transfer failed before Circle returned recoverable step data.",
        },
      });
      return reply.code(502).send({
        ok: false,
        operationId: operation.id,
        recoverable: false,
        code: "CCTP_BRIDGE_FAILED",
        message: "The CCTP transfer didn't start. Create a fresh preview before trying again.",
      });
    }
  });

  app.post("/v1/bridge/:id/retry", async (req, reply) => {
    const { id } = z.object({ id: z.string().min(8).max(120) }).parse(req.params);
    const body = z
      .object({ authorization: transactionAuthorizationSchema.optional() })
      .parse(req.body ?? {});
    const user = req.user!;
    const operation = await prisma.bridgeOperation.findFirst({
      where: { id, userId: user.id },
    });
    if (!operation) return reply.code(404).send({ code: "BRIDGE_NOT_FOUND" });
    if (operation.status !== "FAILED" || !operation.resultJson) {
      return reply.code(409).send({
        code: "BRIDGE_NOT_RECOVERABLE",
        message: "This CCTP operation has no recoverable failed step.",
      });
    }
    if (requiresWalletTransactionAuthorization(user)) {
      if (!body.authorization) {
        return reply.code(401).send({ code: "WALLET_AUTHORIZATION_REQUIRED" });
      }
      try {
        await authorizeBridgeRetry({ user, ...body.authorization, operationId: id });
      } catch (error) {
        const code = error instanceof Error ? error.message : "TRANSACTION_UNAUTHORIZED";
        return reply.code(code === "WALLET_NOT_LINKED" ? 403 : 401).send({
          code,
          message: "The signature doesn't authorize recovery of this CCTP operation.",
        });
      }
    }
    const assessment = await assessEvmRecipient({
      address: operation.recipientAddress,
      chain: operation.destinationChain,
    });
    if (!assessment.allowed) {
      return reply.code(422).send({ code: "RECIPIENT_RISK_BLOCKED", message: assessment.message });
    }
    const wallet = user.wallets[0];
    if (!wallet?.vendorWalletId || wallet.vendor !== "circle_modular") {
      return reply.code(422).send({ code: "CIRCLE_WALLET_REQUIRED" });
    }
    if (isOwnSmartWalletRecipient(wallet.scaAddress, operation.recipientAddress)) {
      if (
        !isCctpEvmTestnetChainId(operation.destinationChain) ||
        !isCircleScaCctpDestination(operation.destinationChain)
      ) {
        return reply.code(422).send({
          code: "SMART_WALLET_DESTINATION_UNAVAILABLE",
          message: SMART_WALLET_CCTP_DESTINATION_MESSAGE,
        });
      }
      try {
        await ensureCircleScaDestination({
          vendorWalletId: wallet.vendorWalletId,
          scaAddress: wallet.scaAddress,
          destinationChain: operation.destinationChain,
        });
      } catch (error) {
        log.error("cctp", "Bridge retry smart wallet derivation failed", {
          destinationChain: operation.destinationChain,
          message: error instanceof Error ? error.message : "CIRCLE_SCA_DERIVATION_FAILED",
        });
        return reply.code(502).send({
          code: "SMART_WALLET_DERIVATION_FAILED",
          message: "Coretta couldn't prepare your smart wallet on the destination network. The bridge retry was not started.",
        });
      }
    }
    await prisma.bridgeOperation.update({
      where: { id },
      data: { status: "EXECUTING", failureReason: null },
    });
    try {
      const result = await retryCctpBridge(parseBridgeResult(operation.resultJson));
      const summary = summarizeBridgeResult(result);
      const status = summary.state === "success" ? "COMPLETE" : summary.state === "error" ? "FAILED" : "PENDING";
      await prisma.bridgeOperation.update({
        where: { id },
        data: {
          status,
          resultJson: serializeBridgeResult(result),
          sourceTxHash: summary.sourceTxHash,
          destinationTxHash: summary.destinationTxHash,
          failureReason: summary.failureReason,
        },
      });
      const aggregate = operation.batchId
        ? await refreshBridgeBatchStatus(operation.batchId)
        : undefined;
      return reply.code(status === "COMPLETE" ? 200 : status === "PENDING" ? 202 : 422).send({
        ok: status !== "FAILED",
        operationId: id,
        destinationChain: operation.destinationChain,
        amount: operation.amount,
        ...summary,
        aggregate,
      });
    } catch (error) {
      await prisma.bridgeOperation.update({
        where: { id },
        data: {
          status: "FAILED",
          failureReason: "Circle couldn't resume the recoverable CCTP step.",
        },
      });
      const aggregate = operation.batchId
        ? await refreshBridgeBatchStatus(operation.batchId)
        : undefined;
      return reply.code(502).send({
        ok: false,
        operationId: id,
        recoverable: true,
        code: "CCTP_RETRY_FAILED",
        message: "The recoverable CCTP step still hasn't completed. Check Activity before retrying again.",
        aggregate,
      });
    }
  });

  app.get("/v1/bridge/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().min(8).max(120) }).parse(req.params);
    const operation = await prisma.bridgeOperation.findFirst({
      where: { id, userId: req.user!.id },
    });
    if (!operation) return reply.code(404).send({ code: "BRIDGE_NOT_FOUND" });
    return reply.send({
      id: operation.id,
      status: operation.status,
      sourceChain: operation.sourceChain,
      destinationChain: operation.destinationChain,
      recipientAddress: operation.recipientAddress,
      amount: operation.amount,
      sourceTxHash: operation.sourceTxHash,
      destinationTxHash: operation.destinationTxHash,
      failureReason: operation.failureReason,
      createdAt: operation.createdAt.toISOString(),
      updatedAt: operation.updatedAt.toISOString(),
    });
  });

  app.post("/v1/remit", async (req, reply) => {
    const body = z
      .object({
        recipient: z.object({
          // Email is optional. Wallet-only remittances from an EOA to a smart wallet are allowed.
          type: z.enum(["email", "phone", "wallet"]),
          value: z.string().min(3),
        }),
        amount: z.string().regex(/^\d+(?:\.\d{1,6})?$/),
        asset: z.enum(["USDC", "EURC"]).optional().default("USDC"),
        idempotencyKey: z.string().uuid(),
        execute: z.boolean().optional().default(true),
        authorization: transactionAuthorizationSchema.optional(),
      })
      .parse(req.body);

    const user = req.user!;
    if (requiresWalletTransactionAuthorization(user)) {
      if (!body.authorization) {
        return reply.code(401).send({
          code: "WALLET_AUTHORIZATION_REQUIRED",
          message: "The external wallet linked to this account must authorize this remittance.",
        });
      }
      try {
        await authorizeRemit({
          user,
          ...body.authorization,
          request: {
            recipient: body.recipient,
            amount: body.amount,
            asset: body.asset,
            idempotencyKey: body.idempotencyKey,
          },
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "TRANSACTION_UNAUTHORIZED";
        return reply.code(code === "WALLET_NOT_LINKED" ? 403 : 401).send({
          code,
          message: "Transaction signature is invalid, expired, or does not match this remittance.",
        });
      }
    }
    if (body.recipient.type === "wallet") {
      const assessment = await assessEvmRecipient({
        address: body.recipient.value,
        chain: CCTP_SOURCE_CHAIN,
      });
      if (!assessment.allowed) {
        return reply.code(422).send({
          code:
            assessment.category === "contract"
              ? "CONTRACT_RECIPIENT_BLOCKED"
              : "RECIPIENT_RISK_BLOCKED",
          message: assessment.message,
        });
      }
    }
    await createAuditEvent({
      actorId: user.id,
      action: "TRANSACTION_PREPARED",
      metadata: {
        recipient: body.recipient,
        amount: body.amount,
        asset: body.asset,
      },
    });

    let transfer: Awaited<ReturnType<typeof createRemittance>>;
    try {
      transfer = await createRemittance({
        senderUserId: user.id,
        recipientType: body.recipient.type,
        recipientValue: body.recipient.value,
        amount: body.amount,
        asset: body.asset,
        idempotencyKey: body.idempotencyKey,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_CONFLICT") {
        return reply.code(409).send({
          code: "IDEMPOTENCY_KEY_CONFLICT",
          message: "This idempotency key belongs to a different transaction.",
        });
      }
      throw error;
    }

    if (transfer.state === "POLICY_DENIED") {
      return reply.code(422).send({
        transferId: transfer.id,
        state: transfer.state,
        reason: transfer.policyReason,
      });
    }

    if (!body.execute) {
      return reply.code(202).send({
        transferId: transfer.id,
        state: transfer.state,
        amountUsdc: formatMicroToUsdc(transfer.amountMicro),
        amount: formatMicroToUsdc(transfer.amountMicro),
        asset: transfer.asset,
      });
    }

    if (transfer.recipientUserId) {
      const approval = await queueRecipientApproval(transfer.id);
      return reply.code(202).send({
        transferId: transfer.id,
        approvalId: approval?.id,
        state: approval?.status === "PENDING" ? "PENDING_APPROVAL" : transfer.state,
        approvalExpiresAt: approval?.expiresAt.toISOString(),
        amountUsdc: formatMicroToUsdc(transfer.amountMicro),
        amount: formatMicroToUsdc(transfer.amountMicro),
        asset: transfer.asset,
        message:
          approval?.status === "PENDING"
            ? "The recipient must approve this Coretta-to-Coretta payment before submission."
            : `This approval was already ${approval?.status.toLowerCase() ?? "processed"}.`,
      });
    }

    try {
      const execution = await executeRemittance(transfer.id);
      const isSettled = execution.state === "SETTLED" || execution.state === "INCLUDED";
      await createAuditEvent({
        actorId: user.id,
        action: "TRANSACTION_SUBMITTED",
        metadata: {
          transferId: execution.id,
          txHash: execution.txHash,
          state: execution.state,
        },
      });
      log.info("remit", isSettled ? "Remittance settled" : "Remittance submitted", {
        transferId: execution.id,
        state: execution.state,
        txHash: execution.txHash,
      });
      return reply.code(isSettled ? 200 : 202).send({
        transferId: execution.id,
        state: execution.state,
        amountUsdc: formatMicroToUsdc(execution.amountMicro),
        amount: formatMicroToUsdc(execution.amountMicro),
        asset: execution.asset,
        userOpHash: execution.userOpHash,
        txHash: execution.txHash,
        explorerUrl: execution.txHash
          ? `${ARC_EXPLORER}/tx/${execution.txHash}`
          : undefined,
        message: isSettled
          ? undefined
          : "Transfer submitted and awaiting Circle confirmation.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "EXECUTION_FAILED";
      log.remit("Remittance execution failed", {
        transferId: transfer.id,
        message,
      });
      return reply.code(502).send({
        transferId: transfer.id,
        state: "FAILED",
        message: "Coretta could not submit this transfer. Check Activity before trying again.",
      });
    }
  });

  /**
   * Token swap on Arc Testnet via Circle App Kit.
   * Rejects USDC↔NATIVE (gas token is already USDC on Arc).
   */
  app.post("/v1/swap", async (req, reply) => {
    const body = z
      .object({
        tokenIn: z.enum(["USDC", "EURC"]),
        tokenOut: z.enum(["USDC", "EURC"]),
        amountIn: z.string().min(1).max(32),
        authorization: transactionAuthorizationSchema.optional(),
      })
      .parse(req.body);

    const user = req.user!;
    if (requiresWalletTransactionAuthorization(user)) {
      if (!body.authorization) {
        return reply.code(401).send({
          code: "WALLET_AUTHORIZATION_REQUIRED",
          message: "The external wallet linked to this account must authorize this swap.",
        });
      }
      try {
        await authorizeSwap({
          user,
          ...body.authorization,
          tokenIn: body.tokenIn,
          tokenOut: body.tokenOut,
          amountIn: body.amountIn,
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "TRANSACTION_UNAUTHORIZED";
        return reply.code(code === "WALLET_NOT_LINKED" ? 403 : 401).send({
          code,
          message: "Transaction signature is invalid, expired, replayed, or does not match this swap.",
        });
      }
    }
    const wallet = user.wallets[0];
    const sca =
      wallet?.scaAddress ??
      user.identities.find((i) => i.type === "wallet")?.normalizedValue;

    if (!sca) {
      return reply.code(400).send({
        code: "WALLET_MISSING",
        message: "No smart wallet is available for this account.",
      });
    }

    if (
      wallet?.vendor === "circle_modular" &&
      wallet.vendorWalletId &&
      wallet.counterfactual
    ) {
      const deployment = await ensureCircleScaDeployed(wallet);
      if (!deployment.deployed) {
        return reply.code(422).send({
          ok: false,
          code: "SMART_WALLET_DEPLOYMENT_FAILED",
          message:
            deployment.error ??
            "Coretta could not activate this smart wallet before the swap.",
        });
      }
    }

    const eoaRaw =
      user.identities.find((i) => i.type === "wallet")?.normalizedValue ??
      user.wallets.find((w) => w.ownerAddress)?.ownerAddress ??
      null;
    let eoa: string | null = null;
    if (eoaRaw) {
      try {
        eoa = normalizeWalletAddress(eoaRaw);
      } catch {
        eoa = eoaRaw.toLowerCase();
      }
    }

    if (!(await consumeSwapRequestQuota(user.id, eoa))) {
      return reply.code(429).send({
        code: "SWAP_REQUEST_LIMIT_REACHED",
        message: "You've reached today's swap request limit.",
      });
    }
    const result = await executeTokenSwap({
      userId: user.id,
      walletAddress: sca,
      tokenIn: body.tokenIn,
      tokenOut: body.tokenOut,
      amountIn: body.amountIn,
      eoaAddress: eoa,
    });

    if (!result.ok) {
      const status =
        result.code === "ALREADY_GAS_TOKEN"
          ? 400
          : result.code === "KIT_KEY_MISSING" || result.code === "CIRCLE_CONFIG_MISSING"
            ? 503
            : 422;
      return reply.code(status).send(result);
    }

    return reply.send(result);
  });

  app.post("/v1/swap/estimate", async (req, reply) => {
    const body = z
      .object({
        tokenIn: z.enum(["USDC", "EURC"]),
        tokenOut: z.enum(["USDC", "EURC"]),
        amountIn: z.string().min(1).max(32),
      })
      .parse(req.body);
    const user = req.user!;
    const wallet = user.wallets[0];
    const sca =
      wallet?.scaAddress ??
      user.identities.find((identity) => identity.type === "wallet")?.normalizedValue;
    if (!sca) {
      return reply.code(400).send({
        ok: false,
        code: "WALLET_MISSING",
        message: "No smart wallet is available for this account.",
      });
    }
    const quotaWallet =
      user.identities.find((identity) => identity.type === "wallet")?.normalizedValue ??
      user.wallets.find((item) => item.ownerAddress)?.ownerAddress ??
      null;
    if (!(await consumeSwapRequestQuota(user.id, quotaWallet))) {
      return reply.code(429).send({
        ok: false,
        code: "SWAP_REQUEST_LIMIT_REACHED",
        message: "You've reached today's swap request limit.",
      });
    }
    const result = await estimateTokenSwap({
      userId: user.id,
      walletAddress: sca,
      tokenIn: body.tokenIn,
      tokenOut: body.tokenOut,
      amountIn: body.amountIn,
    });
    if (!result.ok) {
      const status =
        result.code === "KIT_KEY_MISSING" || result.code === "CIRCLE_CONFIG_MISSING"
          ? 503
          : 422;
      return reply.code(status).send(result);
    }
    return result;
  });

  app.post("/v1/swap-and-send", async (req, reply) => {
    const remitRequestSchema = z.object({
      recipient: z.object({
        type: z.enum(["email", "phone", "wallet"]),
        value: z.string().min(3),
      }),
      amount: z.string().regex(/^\d+(?:\.\d{1,6})?$/),
      asset: z.enum(["USDC", "EURC"]),
      idempotencyKey: z.string().uuid(),
    });
    const body = z
      .object({
        tokenIn: z.enum(["USDC", "EURC"]),
        tokenOut: z.enum(["USDC", "EURC"]),
        amountIn: z.string().min(1).max(32),
        requests: z.array(remitRequestSchema).min(1).max(MAX_BATCH_RECIPIENTS),
        authorization: transactionAuthorizationSchema.optional(),
      })
      .refine((value) => value.tokenIn !== value.tokenOut, {
        message: "Source and destination assets must differ.",
      })
      .refine((value) => value.requests.every((item) => item.asset === value.tokenOut), {
        message: "Every remittance must use the swap output asset.",
      })
      .refine(
        (value) => {
          const keys = value.requests.map(
            (item) => `${item.recipient.type}:${item.recipient.value.toLowerCase()}`,
          );
          return new Set(keys).size === keys.length;
        },
        { message: "Duplicate recipients must be combined into one payment leg." },
      )
      .parse(req.body);
    const user = req.user!;
    if (requiresWalletTransactionAuthorization(user)) {
      if (!body.authorization) {
        return reply.code(401).send({
          code: "WALLET_AUTHORIZATION_REQUIRED",
          message: "The linked wallet must authorize this swap-and-send plan.",
        });
      }
      try {
        await authorizeSwapAndSend({
          user,
          ...body.authorization,
          tokenIn: body.tokenIn,
          tokenOut: body.tokenOut,
          amountIn: body.amountIn,
          requests: body.requests,
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "TRANSACTION_UNAUTHORIZED";
        return reply.code(code === "WALLET_NOT_LINKED" ? 403 : 401).send({
          code,
          message: "The signature is invalid, expired, replayed, or does not match this plan.",
        });
      }
    }

    const wallet = user.wallets[0];
    const sca =
      wallet?.scaAddress ??
      user.identities.find((identity) => identity.type === "wallet")?.normalizedValue;
    if (!sca) {
      return reply.code(400).send({ code: "WALLET_MISSING", message: "No smart wallet is available." });
    }
    if (wallet?.vendor === "circle_modular" && wallet.vendorWalletId && wallet.counterfactual) {
      const deployment = await ensureCircleScaDeployed(wallet);
      if (!deployment.deployed) {
        return reply.code(422).send({
          code: "SMART_WALLET_DEPLOYMENT_FAILED",
          message: deployment.error ?? "Coretta could not activate this smart wallet.",
        });
      }
    }

    const existingPlanLegs = await prisma.transfer.findMany({
      where: { idempotencyKey: { in: body.requests.map((item) => item.idempotencyKey) } },
      select: { senderUserId: true },
    });
    if (existingPlanLegs.length > 0) {
      return reply.code(409).send({
        code: "PLAN_ALREADY_SUBMITTED",
        message: existingPlanLegs.every((item) => item.senderUserId === user.id)
          ? "One or more payment legs were already submitted. Check Activity instead of running the swap again."
          : "One or more idempotency keys belong to a different transaction.",
      });
    }

    const requestedOutput = body.requests.reduce(
      (sum, item) => sum + parseUsdcToMicro(item.amount),
      0n,
    );
    if (user.status !== "ACTIVE" || user.kycTier < 1) {
      return reply.code(422).send({
        code: user.status !== "ACTIVE" ? "SENDER_NOT_ACTIVE" : "KYC_REQUIRED",
        message: "The sender is not currently eligible to execute this payment plan.",
      });
    }
    if (body.requests.some((item) => parseUsdcToMicro(item.amount) > MAX_TRANSFER_MICRO)) {
      return reply.code(422).send({
        code: "AMOUNT_EXCEEDS_MAX",
        message: "Each payment leg must be 100 units or less.",
      });
    }
    const limits = await prisma.userLimit.findUnique({ where: { userId: user.id } });
    const reset = limits ? shouldResetDailyLimits(limits.lastResetAt) : false;
    const sentMicro = reset ? 0n : (limits?.dailySentMicro ?? 0n);
    const sentCount = reset ? 0 : (limits?.dailyTxCount ?? 0);
    const sendCap =
      limits && limits.dailySendMicro > 0n
        ? limits.dailySendMicro
        : DEFAULT_DAILY_SEND_LIMIT_MICRO;
    const countCap = limits?.dailyTxLimit ?? DEFAULT_DAILY_TX_LIMIT;
    if (sentMicro + requestedOutput > sendCap || sentCount + body.requests.length > countCap) {
      return reply.code(422).send({
        code: "DAILY_LIMIT_EXCEEDED",
        message: "The payment legs in this plan exceed the sender's remaining daily limits.",
      });
    }
    const knownRecipients = await Promise.all(
      body.requests.map((item) =>
        findUserByIdentity(item.recipient.type, item.recipient.value),
      ),
    );
    if (knownRecipients.some((recipient) => recipient && recipient.status !== "ACTIVE")) {
      return reply.code(422).send({
        code: "RECIPIENT_NOT_ACTIVE",
        message: "At least one known Coretta recipient is not eligible to receive this payment.",
      });
    }
    const directRecipientAssessments = await Promise.all(
      body.requests
        .filter((item) => item.recipient.type === "wallet")
        .map((item) =>
          assessEvmRecipient({
            address: item.recipient.value,
            chain: CCTP_SOURCE_CHAIN,
          }),
        ),
    );
    const blockedRecipient = directRecipientAssessments.find(
      (assessment) => !assessment.allowed,
    );
    if (blockedRecipient) {
      return reply.code(422).send({
        code:
          blockedRecipient.category === "contract"
            ? "CONTRACT_RECIPIENT_BLOCKED"
            : "RECIPIENT_RISK_BLOCKED",
        message: blockedRecipient.message,
      });
    }
    if (
      knownRecipients.some((recipient) => recipient?.id === user.id) ||
      body.requests.some(
        (item) =>
          item.recipient.type === "wallet" &&
          item.recipient.value.toLowerCase() === sca.toLowerCase(),
      )
    ) {
      return reply.code(422).send({
        code: "SELF_TRANSFER_NOT_ALLOWED",
        message: "A swap-and-send plan cannot include the sender as a payment recipient.",
      });
    }
    const quotaWallet =
      user.identities.find((identity) => identity.type === "wallet")?.normalizedValue ??
      user.wallets.find((item) => item.ownerAddress)?.ownerAddress ??
      null;
    if (!(await consumeSwapRequestQuota(user.id, quotaWallet))) {
      return reply.code(429).send({
        code: "SWAP_REQUEST_LIMIT_REACHED",
        message: "You've reached today's swap request limit.",
      });
    }
    const quote = await estimateTokenSwap({
      userId: user.id,
      walletAddress: sca,
      tokenIn: body.tokenIn,
      tokenOut: body.tokenOut,
      amountIn: body.amountIn,
    });
    if (!quote.ok) return reply.code(422).send(quote);
    if (parseUsdcToMicro(quote.amountOut) < requestedOutput) {
      return reply.code(422).send({
        code: "INSUFFICIENT_ESTIMATED_OUTPUT",
        message: `The current quote returns about ${quote.amountOut} ${body.tokenOut}, less than the ${formatMicroToUsdc(requestedOutput)} ${body.tokenOut} requested for recipients.`,
        quote,
      });
    }

    let operation: Awaited<ReturnType<typeof prisma.swapAndSendOperation.create>>;
    try {
      operation = await prisma.swapAndSendOperation.create({
        data: {
          userId: user.id,
          idempotencyKey: body.requests[0].idempotencyKey,
          status: "EXECUTING",
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        return reply.code(409).send({
          code: "PLAN_ALREADY_SUBMITTED",
          message: "This swap-and-send plan was already started. Check Activity before trying a new plan.",
        });
      }
      throw error;
    }

    const eoaRaw =
      user.identities.find((identity) => identity.type === "wallet")?.normalizedValue ??
      user.wallets.find((item) => item.ownerAddress)?.ownerAddress ??
      null;
    let eoa: string | null = null;
    if (eoaRaw) {
      try {
        eoa = normalizeWalletAddress(eoaRaw);
      } catch {
        eoa = eoaRaw.toLowerCase();
      }
    }
    const swap = await executeTokenSwap({
      userId: user.id,
      walletAddress: sca,
      tokenIn: body.tokenIn,
      tokenOut: body.tokenOut,
      amountIn: body.amountIn,
      eoaAddress: eoa,
    });
    if (!swap.ok) {
      await prisma.swapAndSendOperation.update({
        where: { id: operation.id },
        data: { status: "FAILED", failureReason: swap.message },
      });
      return reply.code(422).send(swap);
    }
    await prisma.swapAndSendOperation.update({
      where: { id: operation.id },
      data: { status: "SWAP_SETTLED", swapTxHash: swap.txHash },
    });

    const remittances = [];
    for (const request of body.requests) {
      try {
        const transfer = await createRemittance({
          senderUserId: user.id,
          recipientType: request.recipient.type,
          recipientValue: request.recipient.value,
          amount: request.amount,
          asset: request.asset,
          idempotencyKey: request.idempotencyKey,
        });
        if (transfer.state === "POLICY_DENIED") {
          remittances.push({
            transferId: transfer.id,
            state: transfer.state,
            reason: transfer.policyReason,
          });
          continue;
        }
        if (transfer.recipientUserId) {
          const approval = await queueRecipientApproval(transfer.id);
          remittances.push({
            transferId: transfer.id,
            approvalId: approval?.id,
            state: "PENDING_APPROVAL",
          });
          continue;
        }
        const execution = await executeRemittance(transfer.id);
        remittances.push({
          transferId: execution.id,
          state: execution.state,
          txHash: execution.txHash,
          explorerUrl: execution.txHash
            ? `${ARC_EXPLORER}/tx/${execution.txHash}`
            : undefined,
        });
      } catch (error) {
        const internalReason = error instanceof Error ? error.message : "REMIT_FAILED";
        log.remit("Swap-and-send payment leg failed", {
          operationId: operation.id,
          message: internalReason,
        });
        remittances.push({
          transferId: null,
          state: "FAILED",
          reason: "The payment leg could not be completed after the swap settled.",
        });
      }
    }

    const hasFailed = remittances.some((item) =>
      ["FAILED", "POLICY_DENIED", "REJECTED", "EXPIRED"].includes(item.state),
    );
    const hasPending = remittances.some(
      (item) => !["SETTLED", "INCLUDED", "FAILED", "POLICY_DENIED", "REJECTED", "EXPIRED"].includes(item.state),
    );
    await prisma.swapAndSendOperation.update({
      where: { id: operation.id },
      data: {
        status: hasFailed ? "PARTIAL" : hasPending ? "PENDING" : "COMPLETE",
        failureReason: hasFailed ? "One or more payment legs failed after the swap settled." : null,
      },
    });
    return reply.code(202).send({
      ok: true,
      operationId: operation.id,
      swap,
      quote,
      remittances,
    });
  });

  app.get("/v1/transfers", async (req) => {
    const user = req.user!;
    const transfers = await prisma.transfer.findMany({
      where: {
        OR: [{ senderUserId: user.id }, { recipientUserId: user.id }],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        senderWallet: true,
        recipientWallet: true,
      },
    });

    return transfers.map((t) => ({
      id: t.id,
      direction: t.senderUserId === user.id ? "out" : "in",
      amountUsdc: formatMicroToUsdc(t.amountMicro),
      state: t.state,
      createdAt: t.createdAt.toISOString(),
      txHash: t.txHash,
      failureReason: t.failureReason ?? undefined,
      explorerUrl: t.txHash ? `${ARC_EXPLORER}/tx/${t.txHash}` : undefined,
      counterpartyAddress:
        t.senderUserId === user.id
          ? t.destinationAddress ?? t.recipientWallet?.scaAddress ?? null
          : t.senderWallet.scaAddress,
    }));
  });

  app.get("/v1/activity", async (req) => {
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(100).default(50) })
      .parse(req.query);
    const user = req.user!;

    const [transfers, swapAudits, bridgeOperations] = await Promise.all([
      prisma.transfer.findMany({
        where: {
          OR: [{ senderUserId: user.id }, { recipientUserId: user.id }],
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          senderWallet: true,
          recipientWallet: true,
        },
      }),
      prisma.auditLog.findMany({
        where: {
          actorId: user.id,
          action: { in: ["SWAP_EXECUTED", "SWAP_FAILED"] },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.bridgeOperation.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
    ]);

    const transferActivity = transfers.map((transfer) => {
      const direction = transfer.senderUserId === user.id ? "out" : "in";
      const complete =
        transfer.state === "SETTLED" || transfer.state === "INCLUDED";
      const failed =
        ["FAILED", "POLICY_DENIED", "REJECTED", "EXPIRED"].includes(transfer.state);
      const status = complete ? "complete" : failed ? "failed" : "pending";
      const amount = formatMicroToUsdc(transfer.amountMicro);
      const verb = direction === "out" ? "Send" : "Receive";
      const label =
        status === "failed"
          ? `Failed ${verb.toLowerCase()}: ${amount} ${transfer.asset}`
          : status === "pending"
            ? `Pending ${verb.toLowerCase()}: ${amount} ${transfer.asset}`
            : `${verb} ${amount} ${transfer.asset}`;

      return {
        id: `transfer_${transfer.id}`,
        kind: "send" as const,
        label,
        status,
        state: transfer.state,
        createdAt: transfer.createdAt.toISOString(),
        asset: transfer.asset,
        amount,
        recipient:
          direction === "out"
            ? transfer.destinationAddress ?? transfer.recipientWallet?.scaAddress ?? null
            : transfer.senderWallet.scaAddress,
        txHash: transfer.txHash ?? undefined,
        failureReason:
          transfer.failureReason ?? transfer.policyReason ?? undefined,
        network: "Arc Testnet",
        explorerUrl: transfer.txHash
          ? `${ARC_EXPLORER}/tx/${transfer.txHash}`
          : undefined,
      };
    });

    const swapActivity = swapAudits.map((audit) => {
      let metadata: Record<string, unknown> = {};
      if (audit.metadata) {
        try {
          const parsed = JSON.parse(audit.metadata) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            metadata = parsed as Record<string, unknown>;
          }
        } catch {
          metadata = {};
        }
      }
      const value = (key: string) =>
        typeof metadata[key] === "string" ? metadata[key] : undefined;
      const tokenIn = value("tokenIn") ?? "USDC";
      const tokenOut = value("tokenOut") ?? "EURC";
      const amount = value("amountIn");
      const txHash = value("txHash");
      const failed = audit.action === "SWAP_FAILED";
      const description = `${amount ? `${amount} ` : ""}${tokenIn} to ${tokenOut}`;

      return {
        id: `swap_${audit.id}`,
        kind: "swap" as const,
        label: failed ? `Failed swap: ${description}` : `Swap ${description}`,
        status: failed ? ("failed" as const) : ("complete" as const),
        state: failed ? "FAILED" : "SETTLED",
        createdAt: audit.createdAt.toISOString(),
        asset: tokenIn,
        amount,
        recipient: tokenOut,
        txHash,
        failureReason: failed ? value("message") : undefined,
        network: "Arc Testnet",
        explorerUrl: txHash ? `${ARC_EXPLORER}/tx/${txHash}` : undefined,
      };
    });

    const bridgeActivity = bridgeOperations.map((operation) => {
      const status =
        operation.status === "COMPLETE"
          ? ("complete" as const)
          : operation.status === "FAILED"
            ? ("failed" as const)
            : ("pending" as const);
      const txHash = operation.destinationTxHash ?? operation.sourceTxHash ?? undefined;
      const destination = listCctpEvmTestnetDestinations().find(
        (chain) => chain.id === operation.destinationChain,
      );
      const explorerUrl =
        operation.destinationTxHash && destination
          ? destination.explorerUrl.replace("{hash}", operation.destinationTxHash)
          : operation.sourceTxHash
            ? `${ARC_EXPLORER}/tx/${operation.sourceTxHash}`
            : undefined;
      return {
        id: `bridge_${operation.id}`,
        kind: "bridge" as const,
        label:
          status === "failed"
            ? `Failed CCTP bridge: ${operation.amount} USDC`
            : status === "pending"
              ? `Pending CCTP bridge: ${operation.amount} USDC`
              : `CCTP bridge ${operation.amount} USDC`,
        status,
        state: operation.status,
        createdAt: operation.createdAt.toISOString(),
        asset: "USDC",
        amount: operation.amount,
        recipient: operation.recipientAddress,
        txHash,
        failureReason: operation.failureReason ?? undefined,
        network: `Arc Testnet → ${destination?.label ?? operation.destinationChain}`,
        explorerUrl,
      };
    });

    return {
      activities: [...transferActivity, ...swapActivity, ...bridgeActivity]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, limit),
    };
  });

  app.get("/v1/transfers/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = req.user!;
    let t = await prisma.transfer.findFirst({
      where: {
        id,
        OR: [{ senderUserId: user.id }, { recipientUserId: user.id }],
      },
    });
    if (!t) return reply.code(404).send({ code: "NOT_FOUND" });
    if (t.state === "SUBMITTED" && t.circleTxId) {
      t = await refreshCircleRemittance(t.id);
    }
    return {
      id: t.id,
      state: t.state,
      amountUsdc: formatMicroToUsdc(t.amountMicro),
      userOpHash: t.userOpHash,
      txHash: t.txHash,
      failureReason: t.failureReason,
      explorerUrl: t.txHash ? `${ARC_EXPLORER}/tx/${t.txHash}` : undefined,
    };
  });

  app.get("/v1/approvals", async (req) => {
    const user = req.user!;
    const approvals = await listApprovalsForUser(user.id);
    return {
      approvals: approvals.map((approval) => {
        const incoming = approval.recipientUserId === user.id;
        const counterparty = incoming ? approval.sender : approval.recipient;
        const counterpartyEmail = counterparty.identities.find(
          (identity) => identity.type === "email",
        )?.normalizedValue;
        return {
          id: approval.id,
          transferId: approval.transferId,
          direction: incoming ? "incoming" : "outgoing",
          status: approval.status,
          amount: formatMicroToUsdc(approval.transfer.amountMicro),
          asset: approval.transfer.asset,
          counterparty:
            counterparty.preferredName ??
            counterpartyEmail ??
            (incoming
              ? approval.transfer.senderWallet.scaAddress
              : approval.transfer.destinationAddress),
          createdAt: approval.createdAt.toISOString(),
          expiresAt: approval.expiresAt.toISOString(),
          decidedAt: approval.decidedAt?.toISOString() ?? null,
          transferState: approval.transfer.state,
          txHash: approval.transfer.txHash,
          explorerUrl: approval.transfer.txHash
            ? `${ARC_EXPLORER}/tx/${approval.transfer.txHash}`
            : undefined,
          failureReason: approval.transfer.failureReason,
        };
      }),
    };
  });

  app.post("/v1/approvals/:id/accept", async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const user = req.user!;
    try {
      const transfer = await acceptApproval({ approvalId: id, recipientUserId: user.id });
      const execution = await executeRemittance(transfer.id);
      return reply.code(execution.state === "SETTLED" ? 200 : 202).send({
        ok: true,
        transferId: execution.id,
        state: execution.state,
        txHash: execution.txHash,
        explorerUrl: execution.txHash
          ? `${ARC_EXPLORER}/tx/${execution.txHash}`
          : undefined,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "APPROVAL_FAILED";
      const notFound = code === "APPROVAL_NOT_FOUND";
      const conflict = /^APPROVAL_(?:ACCEPTED|REJECTED|EXPIRED|ALREADY_DECIDED)$/.test(code);
      return reply.code(notFound ? 404 : conflict ? 409 : 422).send({ code, message: code });
    }
  });

  app.post("/v1/approvals/:id/reject", async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const user = req.user!;
    try {
      const transfer = await rejectApproval({ approvalId: id, recipientUserId: user.id });
      return { ok: true, transferId: transfer.id, state: "REJECTED" };
    } catch (error) {
      const code = error instanceof Error ? error.message : "APPROVAL_FAILED";
      return reply.code(code === "APPROVAL_NOT_FOUND" ? 404 : 409).send({ code, message: code });
    }
  });

  app.get("/v1/notifications", async (req) => {
    const result = await listNotifications(req.user!.id);
    return {
      unreadCount: result.unreadCount,
      notifications: result.items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        body: item.body,
        transferId: item.transferId,
        approvalId: item.approvalId,
        read: Boolean(item.readAt),
        createdAt: item.createdAt.toISOString(),
      })),
    };
  });

  app.patch("/v1/notifications/:id/read", async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const changed = await markNotificationRead({
      notificationId: id,
      userId: req.user!.id,
    });
    if (!changed) return reply.code(404).send({ code: "NOT_FOUND" });
    return { ok: true };
  });

  app.post("/v1/notifications/read-all", async (req) => {
    await markAllNotificationsRead(req.user!.id);
    return { ok: true };
  });

  // ==========================
  // Coretta AI (feedback/memory)
  // ==========================

  app.get("/v1/ai/bootstrap", async (req) => {
    const user = req.user!;
    const actor = await getOrCreateActorForUser(user.id);
    await ensureDefaultPreferences(actor.id);
    const preferences = await getPreferences(actor.id);
    return {
      actorId: actor.id,
      memoryEnabled: preferences.memoryEnabled !== "false",
      personalizationEnabled: preferences.personalizationEnabled !== "false",
      transactionHistoryEnabled: preferences.transactionHistoryEnabled === "true",
      savedRecipientsEnabled: preferences.savedRecipientsEnabled === "true",
    };
  });

  app.get("/v1/ai/session", async (req) => {
    const actor = await getOrCreateActorForUser(req.user!.id);
    await ensureDefaultPreferences(actor.id);
    const [preferences, conversations] = await Promise.all([
      getPreferences(actor.id),
      listConversations(actor.id),
    ]);
    const activeSummary = conversations.find((conversation) => conversation.status === "ACTIVE");
    const activeConversation = activeSummary
      ? await getConversationMessages(actor.id, activeSummary.id)
      : null;
    return {
      actorId: actor.id,
      memoryEnabled: preferences.memoryEnabled !== "false",
      personalizationEnabled: preferences.personalizationEnabled !== "false",
      transactionHistoryEnabled: preferences.transactionHistoryEnabled === "true",
      savedRecipientsEnabled: preferences.savedRecipientsEnabled === "true",
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title ?? "Untitled conversation",
        status: conversation.status,
        preview: conversation.messages[0]?.contentSummary ?? null,
        messageCount: conversation._count.messages,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
      })),
      activeConversation: activeConversation
        ? {
            conversation: {
              id: activeConversation.id,
              title: activeConversation.title ?? "Untitled conversation",
              status: activeConversation.status,
            },
            messages: activeConversation.messages.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              createdAt: message.createdAt.toISOString(),
            })),
          }
        : null,
    };
  });

  app.post("/v1/ai/conversations", async (req, reply) => {
    const user = req.user!;
    const body = z
      .object({
        title: z.string().max(120).optional(),
      })
      .parse(req.body);
    const actor = await getOrCreateActorForUser(user.id);
    const recentConversationCount = await prisma.aiConversation.count({
      where: {
        actorId: actor.id,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (recentConversationCount >= 100) {
      return reply.code(429).send({
        code: "AI_CONVERSATION_RATE_LIMITED",
        message: "Too many new conversations today.",
      });
    }
    const convo = await createConversation(actor.id, body.title);
    return { conversationId: convo.id };
  });

  app.get("/v1/ai/conversations", async (req) => {
    const actor = await getOrCreateActorForUser(req.user!.id);
    const conversations = await listConversations(actor.id);
    return {
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title ?? "Untitled conversation",
        status: conversation.status,
        preview: conversation.messages[0]?.contentSummary ?? null,
        messageCount: conversation._count.messages,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
      })),
    };
  });

  app.get("/v1/ai/conversations/:id/messages", async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const actor = await getOrCreateActorForUser(req.user!.id);
    const conversation = await getConversationMessages(actor.id, id);
    if (!conversation) return reply.code(404).send({ code: "NOT_FOUND" });
    return {
      conversation: {
        id: conversation.id,
        title: conversation.title ?? "Untitled conversation",
        status: conversation.status,
      },
      messages: conversation.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  });

  app.patch("/v1/ai/conversations/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = z.object({ status: z.enum(["ACTIVE", "ARCHIVED"]) }).parse(req.body);
    const actor = await getOrCreateActorForUser(req.user!.id);
    const changed = await setConversationStatus({
      actorId: actor.id,
      conversationId: id,
      status: body.status,
    });
    if (!changed) return reply.code(404).send({ code: "NOT_FOUND" });
    return { ok: true };
  });

  app.post("/v1/ai/messages", async (req, reply) => {
    const user = req.user!;
    const body = z
      .object({
        conversationId: z.string().optional().nullable(),
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(5000),
        contentSummary: z.string().max(300).optional(),
        clientMessageId: z.string().max(80).optional(),
      })
      .parse(req.body);

    const actor = await getOrCreateActorForUser(user.id);
    const recentMessageCount = await prisma.aiMessage.count({
      where: {
        actorId: actor.id,
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        deletedAt: null,
      },
    });
    if (recentMessageCount >= 500) {
      return reply.code(429).send({
        code: "AI_MESSAGE_RATE_LIMITED",
        message: "Too many chat messages. Try again later.",
      });
    }
    const message = await createMessage({
      actorId: actor.id,
      conversationId: body.conversationId ?? null,
      role: body.role,
      content: body.content,
      contentSummary: body.contentSummary,
      clientMessageId: body.clientMessageId,
    });
    return { messageId: message.id };
  });

  app.post("/v1/ai/feedback", async (req, reply) => {
    const user = req.user!;
    const body = z
      .object({
        kind: z.enum(["thumbs", "report"]),
        rating: z.union([z.literal(1), z.literal(-1)]).optional(),
        messageId: z.string().optional().nullable(),
        issueType: z
          .enum([
            "WRONG_RECIPIENT",
            "WRONG_AMOUNT",
            "WRONG_ASSET",
            "MISUNDERSTOOD_INTENT",
            "POOR_RESPONSE",
            "FAILED_TRANSACTION",
            "INCORRECT_SWAP",
            "SUSPICIOUS_BEHAVIOR",
            "UNSAFE_RECOMMENDATION",
            "OTHER",
          ])
          .optional()
          .nullable(),
        comment: z.string().max(2000).optional().nullable(),
        context: z.record(z.any()).optional().nullable(),
      })
      .parse(req.body);

    const actor = await getOrCreateActorForUser(user.id);
    const recentFeedbackCount = await prisma.aiFeedback.count({
      where: {
        actorId: actor.id,
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recentFeedbackCount >= 50) {
      return reply.code(429).send({
        code: "AI_FEEDBACK_RATE_LIMITED",
        message: "Too many feedback submissions. Try again later.",
      });
    }
    const feedback = await createFeedback({
      actorId: actor.id,
      kind: body.kind,
      rating: body.rating,
      messageId: body.messageId ?? null,
      issueType: body.issueType ?? null,
      comment: body.comment ?? null,
      contextJson: body.context ? JSON.stringify(body.context) : null,
    });

    return { ok: true, feedbackId: feedback.id };
  });

  app.get("/v1/ai/memory", async (req) => {
    const user = req.user!;
    const actor = await getOrCreateActorForUser(user.id);
    const memories = await listMemories(actor.id);
    const prefs = await getPreferences(actor.id);
    return {
      memoryEnabled: prefs.memoryEnabled !== "false",
      memories: memories.map((m) => ({
        id: m.id,
        category: m.category,
        key: m.key,
        summary: m.summary,
        dataJson: m.dataJson,
        confidence: m.confidence,
        source: m.source,
        updatedAt: m.updatedAt.toISOString(),
      })),
    };
  });

  app.post("/v1/ai/memory/retrieve", async (req) => {
    const user = req.user!;
    const body = z
      .object({ query: z.string().min(1).max(300) })
      .parse(req.body);
    const actor = await getOrCreateActorForUser(user.id);
    const prefs = await getPreferences(actor.id);
    if (prefs.memoryEnabled === "false") return { memories: [] };
    const memories = await retrieveMemories(actor.id, body.query);
    return {
      memories: memories.map((m) => ({
        id: m.id,
        category: m.category,
        key: m.key,
        summary: m.summary,
        dataJson: m.dataJson,
        confidence: m.confidence,
        source: m.source,
      })),
    };
  });

  app.delete("/v1/ai/memory/:id", async (req, reply) => {
    const user = req.user!;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const actor = await getOrCreateActorForUser(user.id);
    const deleted = await deleteMemory(actor.id, id);
    if (!deleted) return reply.code(404).send({ code: "NOT_FOUND" });
    return { ok: true };
  });

  app.post("/v1/ai/memory/clear", async (req) => {
    const user = req.user!;
    const actor = await getOrCreateActorForUser(user.id);
    await clearMemories(actor.id);
    return { ok: true };
  });

  app.post("/v1/ai/respond", async (req, reply) => {
    const user = req.user!;
    const body = z
      .object({
        conversationId: z.string().optional().nullable(),
        message: z.string().trim().min(1).max(5_000),
      })
      .parse(req.body);
    const security = assessDamianInputSecurity(body.message);
    if (!security.allowed) {
      return {
        available: true,
        reply: security.response,
        blocked: true,
        reason: security.code,
      };
    }
    if (!isDamianModelConfigured()) {
      return { available: false, reply: null };
    }

    const quotaWallet =
      user.identities.find((identity) => identity.type === "wallet")?.normalizedValue ??
      user.wallets.find((wallet) => wallet.ownerAddress)?.ownerAddress ??
      null;
    if (!(await consumeAiRequestQuota(user.id, quotaWallet))) {
      return reply.code(429).send({
        code: "AI_REQUEST_LIMIT_REACHED",
        message: "You've reached today's Damian request limit.",
      });
    }

    const actor = await getOrCreateActorForUser(user.id);
    await ensureDefaultPreferences(actor.id);
    const preferences = await getPreferences(actor.id);
    const response = await generateDamianConversationReply({
      actorId: actor.id,
      conversationId: body.conversationId,
      userMessage: body.message,
      preferredName: user.preferredName,
      personalizationEnabled: preferences.personalizationEnabled !== "false",
    });
    return { available: Boolean(response), reply: response };
  });

  const serializeSavedRecipient = (recipient: {
    id: string;
    label: string;
    address: string;
    network: string;
    source: string;
    isPreferred: boolean;
    useCount: number;
    lastUsedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) => ({
    id: recipient.id,
    label: recipient.label,
    address: recipient.address,
    network: recipient.network,
    source: recipient.source,
    isPreferred: recipient.isPreferred,
    useCount: recipient.useCount,
    lastUsedAt: recipient.lastUsedAt?.toISOString() ?? null,
    createdAt: recipient.createdAt.toISOString(),
    updatedAt: recipient.updatedAt.toISOString(),
  });

  app.get("/v1/ai/saved-recipients", async (req) => {
    const user = req.user!;
    const actor = await getOrCreateActorForUser(user.id);
    await ensureDefaultPreferences(actor.id);
    const [preferences, recipients] = await Promise.all([
      getPreferences(actor.id),
      listSavedRecipients(user.id),
    ]);
    return {
      enabled: preferences.savedRecipientsEnabled === "true",
      recipients: recipients.map(serializeSavedRecipient),
    };
  });

  app.post("/v1/ai/saved-recipients/resolve", async (req, reply) => {
    const user = req.user!;
    const body = z
      .object({
        label: z.string().min(1).max(80),
        network: z.literal("arc-testnet").optional(),
      })
      .parse(req.body);
    const actor = await getOrCreateActorForUser(user.id);
    await ensureDefaultPreferences(actor.id);
    const preferences = await getPreferences(actor.id);
    if (preferences.savedRecipientsEnabled !== "true") {
      return reply.code(403).send({
        code: "SAVED_RECIPIENTS_DISABLED",
        message: "Saved recipients are disabled in Damian Memory.",
      });
    }
    const result = await resolveSavedRecipient({ userId: user.id, ...body });
    return {
      status: result.status,
      matches: result.matches.map(serializeSavedRecipient),
    };
  });

  app.post("/v1/ai/saved-recipients", async (req, reply) => {
    const user = req.user!;
    const body = z
      .object({
        label: z.string().min(1).max(80),
        address: z.string().min(42).max(42),
        network: z.literal("arc-testnet").optional(),
        isPreferred: z.boolean().optional(),
        createdFromTransferId: z.string().optional().nullable(),
        confirmed: z.literal(true),
      })
      .parse(req.body);
    const actor = await getOrCreateActorForUser(user.id);
    await ensureDefaultPreferences(actor.id);
    const preferences = await getPreferences(actor.id);
    if (preferences.savedRecipientsEnabled !== "true") {
      return reply.code(403).send({ code: "SAVED_RECIPIENTS_DISABLED" });
    }
    if (body.createdFromTransferId) {
      const transfer = await prisma.transfer.findFirst({
        where: { id: body.createdFromTransferId, senderUserId: user.id },
        include: { recipientWallet: true },
      });
      const destination =
        transfer?.destinationAddress ?? transfer?.recipientWallet?.scaAddress ?? null;
      if (!transfer || !destination || destination.toLowerCase() !== body.address.toLowerCase()) {
        return reply.code(400).send({ code: "TRANSFER_RECIPIENT_MISMATCH" });
      }
    }
    try {
      const recipient = await saveRecipient({ userId: user.id, ...body });
      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: "SAVED_RECIPIENT_CREATED",
          metadata: JSON.stringify({
            savedRecipientId: recipient.id,
            network: recipient.network,
          }),
        },
      });
      return reply.code(201).send({ recipient: serializeSavedRecipient(recipient) });
    } catch (error) {
      const code = error instanceof Error ? error.message : "SAVED_RECIPIENT_INVALID";
      return reply.code(400).send({ code });
    }
  });

  app.patch("/v1/ai/saved-recipients/:id", async (req, reply) => {
    const user = req.user!;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        label: z.string().min(1).max(80).optional(),
        address: z.string().min(42).max(42).optional(),
        isPreferred: z.boolean().optional(),
        confirmed: z.literal(true),
      })
      .refine(
        (value) =>
          value.label !== undefined ||
          value.address !== undefined ||
          value.isPreferred !== undefined,
        { message: "No saved-recipient change was provided." },
      )
      .parse(req.body);
    try {
      const recipient = await updateSavedRecipient({
        userId: user.id,
        recipientId: id,
        label: body.label,
        address: body.address,
        isPreferred: body.isPreferred,
      });
      if (!recipient) return reply.code(404).send({ code: "NOT_FOUND" });
      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: "SAVED_RECIPIENT_UPDATED",
          metadata: JSON.stringify({ savedRecipientId: recipient.id }),
        },
      });
      return { recipient: serializeSavedRecipient(recipient) };
    } catch (error) {
      const code = error instanceof Error ? error.message : "SAVED_RECIPIENT_INVALID";
      return reply.code(400).send({ code });
    }
  });

  app.delete("/v1/ai/saved-recipients/:id", async (req, reply) => {
    const user = req.user!;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    z.object({ confirmed: z.literal(true) }).parse(req.body);
    const recipient = await forgetSavedRecipient(user.id, id);
    if (!recipient) return reply.code(404).send({ code: "NOT_FOUND" });
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "SAVED_RECIPIENT_FORGOTTEN",
        metadata: JSON.stringify({ savedRecipientId: recipient.id }),
      },
    });
    return { ok: true };
  });

  app.post("/v1/ai/transactions/search", async (req, reply) => {
    const user = req.user!;
    const body = z
      .object({
        states: z.array(z.string().min(1).max(32)).max(10).optional(),
        since: z.string().datetime().optional(),
        until: z.string().datetime().optional(),
        destinationAddresses: z.array(z.string().min(42).max(42)).max(20).optional(),
        direction: z.enum(["sent", "received"]).optional(),
        asset: z.enum(["USDC", "EURC"]).optional(),
        transferId: z.string().min(8).max(120).optional(),
        txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
        period: z.enum(HISTORY_PERIODS).optional(),
        timezoneOffsetMinutes: z.number().int().min(-840).max(840).default(0),
        limit: z.number().int().min(1).max(50).optional(),
      })
      .parse(req.body);
    const actor = await getOrCreateActorForUser(user.id);
    await ensureDefaultPreferences(actor.id);
    const preferences = await getPreferences(actor.id);
    if (preferences.transactionHistoryEnabled !== "true") {
      return reply.code(403).send({ code: "TRANSACTION_HISTORY_DISABLED" });
    }
    const periodRange = resolveHistoryPeriod(body.period, body.timezoneOffsetMinutes);
    const transfers = await searchUserTransfers({
      userId: user.id,
      direction: body.direction,
      states: body.states,
      since: body.since ? new Date(body.since) : periodRange.since,
      until: body.until ? new Date(body.until) : periodRange.until,
      destinationAddresses: body.destinationAddresses,
      asset: body.asset,
      transferId: body.transferId,
      txHash: body.txHash,
      limit: body.limit,
    });
    return {
      transfers: transfers.map(({ amountMicro: _amountMicro, ...transfer }) => ({
        ...transfer,
        createdAt: transfer.createdAt.toISOString(),
        settledAt: transfer.settledAt?.toISOString() ?? null,
      })),
    };
  });

  app.get("/v1/ai/transactions/last-settled", async (req, reply) => {
    const user = req.user!;
    const query = z
      .object({
        period: z.enum(HISTORY_PERIODS).optional(),
        timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840).default(0),
      })
      .parse(req.query);
    const actor = await getOrCreateActorForUser(user.id);
    await ensureDefaultPreferences(actor.id);
    const preferences = await getPreferences(actor.id);
    if (preferences.transactionHistoryEnabled !== "true") {
      return reply.code(403).send({ code: "TRANSACTION_HISTORY_DISABLED" });
    }
    const transfer = await getLastSettledTransfer(
      user.id,
      resolveHistoryPeriod(query.period, query.timezoneOffsetMinutes),
    );
    if (!transfer) return { transfer: null };
    const { amountMicro: _amountMicro, ...serializable } = transfer;
    return {
      transfer: {
        ...serializable,
        createdAt: transfer.createdAt.toISOString(),
        settledAt: transfer.settledAt?.toISOString() ?? null,
      },
    };
  });

  app.post("/v1/ai/transactions/summary", async (req, reply) => {
    const user = req.user!;
    const body = z
      .object({
        label: z.string().min(1).max(80).optional(),
        address: z.string().min(42).max(42).optional(),
        since: z.string().datetime().optional(),
        until: z.string().datetime().optional(),
        period: z.enum(HISTORY_PERIODS).optional(),
        timezoneOffsetMinutes: z.number().int().min(-840).max(840).default(0),
      })
      .refine((value) => Boolean(value.label || value.address), {
        message: "A saved label or address is required.",
      })
      .parse(req.body);
    const actor = await getOrCreateActorForUser(user.id);
    await ensureDefaultPreferences(actor.id);
    const preferences = await getPreferences(actor.id);
    if (preferences.transactionHistoryEnabled !== "true") {
      return reply.code(403).send({ code: "TRANSACTION_HISTORY_DISABLED" });
    }

    let addresses = body.address ? [body.address] : [];
    if (body.label) {
      if (preferences.savedRecipientsEnabled !== "true") {
        return reply.code(403).send({ code: "SAVED_RECIPIENTS_DISABLED" });
      }
      const resolved = await resolveSavedRecipient({ userId: user.id, label: body.label });
      if (resolved.status === "not_found") {
        return reply.code(404).send({ code: "SAVED_RECIPIENT_NOT_FOUND" });
      }
      if (resolved.status === "ambiguous") {
        return reply.code(409).send({
          code: "SAVED_RECIPIENT_AMBIGUOUS",
          matches: resolved.matches.map(serializeSavedRecipient),
        });
      }
      addresses = resolved.matches.map((recipient) => recipient.address);
    }
    const periodRange = resolveHistoryPeriod(body.period, body.timezoneOffsetMinutes);
    const totals = await sumSettledTransfersTo({
      userId: user.id,
      addresses,
      since: body.since ? new Date(body.since) : periodRange.since,
      until: body.until ? new Date(body.until) : periodRange.until,
    });
    return {
      totals: totals.map(({ amountMicro: _amountMicro, ...total }) => total),
      states: settledTransferStates(),
      addresses,
    };
  });

  app.post("/v1/ai/preferences", async (req) => {
    const user = req.user!;
    const body = z
      .object({
        memoryEnabled: z.boolean().optional(),
        personalizationEnabled: z.boolean().optional(),
        transactionHistoryEnabled: z.boolean().optional(),
        savedRecipientsEnabled: z.boolean().optional(),
      })
      .parse(req.body);
    const actor = await getOrCreateActorForUser(user.id);
    if (typeof body.memoryEnabled === "boolean") {
      await setPreference(actor.id, "memoryEnabled", body.memoryEnabled ? "true" : "false");
    }
    if (typeof body.personalizationEnabled === "boolean") {
      await setPreference(
        actor.id,
        "personalizationEnabled",
        body.personalizationEnabled ? "true" : "false",
      );
    }
    if (typeof body.transactionHistoryEnabled === "boolean") {
      await setPreference(
        actor.id,
        "transactionHistoryEnabled",
        body.transactionHistoryEnabled ? "true" : "false",
      );
    }
    if (typeof body.savedRecipientsEnabled === "boolean") {
      await setPreference(
        actor.id,
        "savedRecipientsEnabled",
        body.savedRecipientsEnabled ? "true" : "false",
      );
    }
    const preferences = await getPreferences(actor.id);
    return {
      memoryEnabled: preferences.memoryEnabled !== "false",
      personalizationEnabled: preferences.personalizationEnabled !== "false",
      transactionHistoryEnabled: preferences.transactionHistoryEnabled === "true",
      savedRecipientsEnabled: preferences.savedRecipientsEnabled === "true",
    };
  });
}
