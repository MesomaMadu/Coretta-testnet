import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@arcremit/db";
import { formatMicroToUsdc, ARC_EXPLORER } from "@arcremit/shared";
import { loginWithIdentity, resolveSession } from "../services/auth.js";
import { createRemittance, executeRemittance } from "../services/orchestrator.js";
import {
  getWalletBalanceMicro,
  findUserByIdentity,
} from "../services/wallet.js";
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

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true, service: "arcremit-api" }));

  app.post("/v1/auth/login", async (req, reply) => {
    const body = z
      .object({
        type: z.enum(["email", "phone"]),
        value: z.string().min(3),
      })
      .parse(req.body);

    const { token, user, expiresAt } = await loginWithIdentity(
      body.type,
      body.value,
    );
    const wallet = user.wallets[0];
    return reply.send({
      token,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: user.id,
        walletAddress: wallet?.scaAddress,
        identities: user.identities.map((i) => ({
          type: i.type,
          value: i.normalizedValue,
        })),
      },
    });
  });

  app.addHook("preHandler", async (req, reply) => {
    if (
      req.url === "/health" ||
      req.url.startsWith("/v1/auth/") ||
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
    return {
      id: user.id,
      walletAddress: wallet?.scaAddress,
      balanceUsdc: formatMicroToUsdc(balanceMicro),
      balanceMicro: balanceMicro.toString(),
      identities: user.identities.map((i) => ({
        type: i.type,
        value: i.normalizedValue,
      })),
    };
  });

  app.get("/v1/recipients/lookup", async (req, reply) => {
    const q = z
      .object({
        type: z.enum(["email", "phone"]),
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
          type: z.enum(["email", "phone"]),
          value: z.string(),
        }),
        amount: z.string(),
        idempotencyKey: z.string().uuid(),
        execute: z.boolean().optional().default(true),
      })
      .parse(req.body);

    const user = req.user!;
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
      return reply.code(502).send({
        transferId: transfer.id,
        state: "FAILED",
        message,
      });
    }
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
