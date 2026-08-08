import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@arcremit/db";
import { formatMicroToUsdc, ARC_EXPLORER } from "@arcremit/shared";
import { resolveSession } from "../services/auth.js";
import { createRemittance, executeRemittance } from "../services/orchestrator.js";
import {
  getWalletBalanceMicro,
  findUserByIdentity,
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
  upsertMemory,
  clearMemories,
} from "../services/ai.js";

import {
  anonymousUsageMetrics,
  getUserUsageMetrics,
  getWalletUsageMetrics,
  trackUsageEvent,
} from "../services/limits.js";
import { determineOptimalRoute } from "../services/router.js";
import { authenticateWalletOwnership } from "../services/wallet-auth.js";
import { normalizeWalletAddress } from "@arcremit/shared";

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true, service: "arcremit-api" }));

  /** Email auth temporarily disabled — wallet-only. */
  app.get("/v1/auth/email-status", async (_req, reply) => {
    return reply.send({
      configured: false,
      provider: "Disabled",
      fromAddress: null,
      devMode: process.env.DEV_MODE === "true",
      reason:
        "Email login and OTP are temporarily disabled. Connect a browser wallet and verify ownership to authenticate.",
    });
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
      code: "EMAIL_AUTH_DISABLED",
      message: "Email OTP is temporarily disabled. Use wallet connection.",
    });
  });

  app.post("/v1/auth/otp/verify", async (_req, reply) => {
    return reply.code(410).send({
      code: "EMAIL_AUTH_DISABLED",
      message: "Email OTP is temporarily disabled. Use wallet connection.",
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
      const code =
        message === "INVALID_SIGNATURE" ||
        message === "INVALID_OWNERSHIP_MESSAGE" ||
        message === "ADDRESS_MISMATCH" ||
        message === "MESSAGE_EXPIRED"
          ? 401
          : 400;
      return reply.code(code).send({ code: message, message });
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
      req.url === "/health" ||
      req.url.startsWith("/v1/auth/") ||
      req.url.startsWith("/v1/presence/") ||
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
      ...binding,
    };
  });

  app.get("/v1/wallet/status", async (req) => {
    const user = req.user!;
    return getWalletBindingStatus(user.id);
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
        idempotencyKey: z.string().uuid(),
        execute: z.boolean().optional().default(true),
      })
      .parse(req.body);

    const user = req.user!;
    await createAuditEvent({
      actorId: user.id,
      action: "TRANSACTION_PREPARED",
      metadata: {
        recipient: body.recipient,
        amount: body.amount,
      },
    });

    const transfer = await createRemittance({
      senderUserId: user.id,
      recipientType: body.recipient.type,
      recipientValue: body.recipient.value,
      amount: body.amount,
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
      });
    }

    try {
      const settled = await executeRemittance(transfer.id);
      const eoa =
        user.identities.find((i) => i.type === "wallet")?.normalizedValue ??
        user.wallets[0]?.ownerAddress ??
        null;
      await trackUsageEvent({
        walletAddress: eoa,
        userId: user.id,
        key: "sponsoredTxCount",
      });
      await trackUsageEvent({
        walletAddress: eoa,
        userId: user.id,
        key: "sponsoredUsdMicro",
        amount: settled.amountMicro,
      });
      await createAuditEvent({
        actorId: user.id,
        action: "TRANSACTION_SUBMITTED",
        metadata: {
          transferId: settled.id,
          txHash: settled.txHash,
          state: settled.state,
          walletAddress: eoa,
        },
      });
      log.info("remit", "Remittance settled", {
        transferId: settled.id,
        state: settled.state,
        txHash: settled.txHash,
      });
      return reply.send({
        transferId: settled.id,
        state: settled.state,
        amountUsdc: formatMicroToUsdc(settled.amountMicro),
        userOpHash: settled.userOpHash,
        txHash: settled.txHash,
        explorerUrl: settled.txHash
          ? `${ARC_EXPLORER}/tx/${settled.txHash}`
          : undefined,
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
        tokenIn: z.enum(["USDC", "EURC", "NATIVE", "USDT"]),
        tokenOut: z.enum(["USDC", "EURC", "NATIVE", "USDT"]),
        amountIn: z.string().min(1).max(32),
        /** Optional override; defaults to user's first SCA */
        walletAddress: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/)
          .optional(),
      })
      .parse(req.body);

    const user = req.user!;
    const sca =
      body.walletAddress ??
      user.wallets[0]?.scaAddress ??
      user.identities.find((i) => i.type === "wallet")?.normalizedValue;

    if (!sca) {
      return reply.code(400).send({
        code: "WALLET_MISSING",
        message: "No smart wallet on account. Connect wallet and verify ownership first.",
      });
    }

    const eoa =
      user.identities.find((i) => i.type === "wallet")?.normalizedValue ??
      user.wallets[0]?.ownerAddress ??
      null;

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
      explorerUrl: t.txHash ? `${ARC_EXPLORER}/tx/${t.txHash}` : undefined,
      counterpartyAddress:
        t.senderUserId === user.id
          ? t.recipientWallet.scaAddress
          : t.senderWallet.scaAddress,
    }));
  });

  app.get("/v1/transfers/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = req.user!;
    const t = await prisma.transfer.findFirst({
      where: {
        id,
        OR: [{ senderUserId: user.id }, { recipientUserId: user.id }],
      },
    });
    if (!t) return reply.code(404).send({ code: "NOT_FOUND" });
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
  // ArcRemit AI (feedback/memory)
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

    // Safe learning: only update memory from explicit positive signals.
    if (body.kind === "thumbs" && body.rating === 1 && body.context) {
      const preview = body.context.preview as
        | {
            recipient?: string;
            asset?: string;
            amount?: string;
            action?: string;
          }
        | undefined;

      if (preview?.recipient && preview?.asset) {
        await upsertMemory({
          actorId: actor.id,
          category: "RECIPIENT",
          key: "last_recipient",
          summary: `Last recipient: ${preview.recipient}`,
          dataJson: JSON.stringify({ recipient: preview.recipient }),
          confidence: 85,
          source: "feedback",
        });
        await upsertMemory({
          actorId: actor.id,
          category: "ASSET_PREF",
          key: "preferred_asset",
          summary: `Preferred asset: ${preview.asset}`,
          dataJson: JSON.stringify({ asset: preview.asset }),
          confidence: 70,
          source: "feedback",
        });
      }
    }

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

  app.post("/v1/ai/preferences", async (req) => {
    const user = req.user!;
    const body = z
      .object({
        memoryEnabled: z.boolean().optional(),
        personalizationEnabled: z.boolean().optional(),
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
    const preferences = await getPreferences(actor.id);
    return {
      memoryEnabled: preferences.memoryEnabled !== "false",
      personalizationEnabled: preferences.personalizationEnabled !== "false",
    };
  });
}
