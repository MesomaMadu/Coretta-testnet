import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@coretta/db";
import { formatMicroToUsdc, ARC_EXPLORER } from "@coretta/shared";
import { resolveSession } from "../services/auth.js";
import {
  createRemittance,
  executeRemittance,
  refreshCircleRemittance,
} from "../services/orchestrator.js";
import {
  getWalletBalanceMicro,
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
import { executeTokenSwap } from "../services/swap.js";
import { log } from "../lib/log.js";
import {
  createConversation,
  createFeedback,
  createMessage,
  deleteMemory,
  ensureDefaultPreferences,
  getOrCreateActorForUser,
  getPreferences,
  listMemories,
  retrieveMemories,
  setPreference,
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
  isPrivyConfigured,
} from "../services/privy.js";
import {
  authorizeRemit,
  authorizeSwap,
  requiresWalletTransactionAuthorization,
} from "../services/transaction-auth.js";
import {
  listWalletInteractions,
  recordWalletInteraction,
} from "../services/wallet-interactions.js";
import { normalizeWalletAddress } from "@coretta/shared";

const transactionAuthorizationSchema = z.object({
  message: z.string().min(100).max(20_000),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/).min(100).max(300),
});

const TRANSIENT_DATABASE_ERROR =
  /P1001|P1002|P1017|Can't reach database server|connection pool|timed out fetching|ECONNRESET|ETIMEDOUT|ENOTFOUND/i;

const PREFERRED_NAME_EDIT_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

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

async function retryDatabaseRead<T>(operation: () => Promise<T>): Promise<T> {
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

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true, service: "coretta-api" }));

  app.get("/health/database", async (_req, reply) => {
    try {
      await retryDatabaseRead(() => prisma.$queryRawUnsafe("SELECT 1"));
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
      const user = await retryDatabaseRead(() =>
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
        await retryDatabaseRead(() => inspectPrivyEmailAccount(accessToken)),
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
    const user = await resolveSession(req.headers.authorization);
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
    const user = await resolveSession(req.headers.authorization);
    if (!user) {
      return reply.code(401).send({ code: "UNAUTHORIZED", message: "Invalid session" });
    }
    req.user = user;
  });

  app.get("/v1/me", async (req) => {
    const user = req.user!;
    const wallet = user.wallets[0];
    let balanceMicro = 0n;
    if (wallet) {
      balanceMicro = await getWalletBalanceMicro(
        wallet.scaAddress as `0x${string}`,
      );
    }
    const binding = await getWalletBindingStatus(user.id);
    return {
      id: user.id,
      walletAddress: wallet?.scaAddress,
      balanceUsdc: formatMicroToUsdc(balanceMicro),
      balanceMicro: balanceMicro.toString(),
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
    const result = await prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [
          { preferredName: null },
          { preferredNameUpdatedAt: null },
          { preferredNameUpdatedAt: { lte: cutoff } },
        ],
      },
      data: { preferredName, preferredNameUpdatedAt: now },
    });

    if (result.count === 0) {
      const current = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
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

  app.post("/v1/wallet/activate", async (req) => {
    const user = req.user!;
    const body = z
      .object({ primaryWalletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/) })
      .parse(req.body);
    const res = await activateSmartWallet(user.id, body.primaryWalletAddress);
    await trackUsageEvent({
      walletAddress: body.primaryWalletAddress.toLowerCase(),
      userId: user.id,
      key: "walletCreationCount",
    });
    return res;
  });

  app.post("/v1/wallet/bind", async (req) => {
    const user = req.user!;
    const body = z
      .object({ primaryWalletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/) })
      .parse(req.body);
    return bindPrimaryWallet(user.id, body.primaryWalletAddress);
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

  app.post("/v1/remit", async (req, reply) => {
    const body = z
      .object({
        recipient: z.object({
          // email optional — wallet-only remits allowed (EOA → smart wallet account)
          type: z.enum(["email", "phone", "wallet"]),
          value: z.string().min(3),
        }),
        amount: z.string(),
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
    await createAuditEvent({
      actorId: user.id,
      action: "TRANSACTION_PREPARED",
      metadata: {
        recipient: body.recipient,
        amount: body.amount,
        asset: body.asset,
      },
    });

    const transfer = await createRemittance({
      senderUserId: user.id,
      recipientType: body.recipient.type,
      recipientValue: body.recipient.value,
      amount: body.amount,
      asset: body.asset,
      idempotencyKey: body.idempotencyKey,
    });

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
        message,
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

    const [transfers, swapAudits] = await Promise.all([
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
    ]);

    const transferActivity = transfers.map((transfer) => {
      const direction = transfer.senderUserId === user.id ? "out" : "in";
      const complete =
        transfer.state === "SETTLED" || transfer.state === "INCLUDED";
      const failed =
        transfer.state === "FAILED" || transfer.state === "POLICY_DENIED";
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

    return {
      activities: [...transferActivity, ...swapActivity]
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

  app.post("/v1/ai/conversations", async (req) => {
    const user = req.user!;
    const body = z
      .object({
        title: z.string().max(120).optional(),
      })
      .parse(req.body);
    const actor = await getOrCreateActorForUser(user.id);
    const convo = await createConversation(actor.id, body.title);
    return { conversationId: convo.id };
  });

  app.post("/v1/ai/messages", async (req) => {
    const user = req.user!;
    const body = z
      .object({
        conversationId: z.string().optional().nullable(),
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1).max(5000),
        contentSummary: z.string().max(300).optional(),
        clientMessageId: z.string().max(80).optional(),
      })
      .parse(req.body);

    const actor = await getOrCreateActorForUser(user.id);
    if (body.role === "user") {
      const eoa =
        user.identities.find((i) => i.type === "wallet")?.normalizedValue ??
        user.wallets[0]?.ownerAddress ??
        null;
      await trackUsageEvent({
        walletAddress: eoa,
        userId: user.id,
        key: "aiRequestCount",
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

  app.post("/v1/ai/feedback", async (req) => {
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
    if (!isDamianModelConfigured()) {
      return { available: false, reply: null };
    }

    const usage = await getUserUsageMetrics(user.id);
    if (usage.aiRequestCount > usage.aiRequestLimit) {
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
        limit: z.number().int().min(1).max(50).optional(),
      })
      .parse(req.body);
    const actor = await getOrCreateActorForUser(user.id);
    await ensureDefaultPreferences(actor.id);
    const preferences = await getPreferences(actor.id);
    if (preferences.transactionHistoryEnabled !== "true") {
      return reply.code(403).send({ code: "TRANSACTION_HISTORY_DISABLED" });
    }
    const transfers = await searchUserTransfers({
      userId: user.id,
      states: body.states,
      since: body.since ? new Date(body.since) : undefined,
      until: body.until ? new Date(body.until) : undefined,
      destinationAddresses: body.destinationAddresses,
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
