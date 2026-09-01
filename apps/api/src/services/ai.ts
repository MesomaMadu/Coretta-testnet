import { prisma } from "@coretta/db";
import { config } from "../config.js";
import { decryptText, encryptText, hashAiActor } from "../lib/crypto.js";

const SECRET_PATTERNS: RegExp[] = [
  /\b(?:seed phrase|recovery phrase|mnemonic)\b\s*(?::|=|is)\s*(?:[a-z]{2,}\s+){11,23}[a-z]{2,}\b/i,
  /\b(?:private key|passphrase|secret|api key)\b\s*(?::|=|is)\s*\S{8,}/i,
  /\bBearer\s+[A-Za-z0-9._~-]+\b/i,
  /\b(?:sk|key)-[A-Za-z0-9_-]{12,}\b/i,
  /\b0x[a-fA-F0-9]{64}\b/, // likely private key
];

export function assertNoSecrets(text: string) {
  for (const p of SECRET_PATTERNS) {
    if (p.test(text)) {
      throw new Error("SENSITIVE_DATA_REJECTED");
    }
  }
}

export function redactAiSummary(text: string) {
  return redactSensitiveIdentifiers(text).slice(0, 300);
}

export function redactSensitiveIdentifiers(text: string) {
  return text
    .replace(/\b0x[a-fA-F0-9]{64}\b/g, "[sensitive 32-byte value]")
    .replace(/0x[a-fA-F0-9]{40}/g, "[wallet address]")
    .replace(/[\w.+-]+@[\w.-]+\.\w+/g, "[email address]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone number]")
    .replace(/\bBearer\s+[A-Za-z0-9._~-]+\b/gi, "[auth token]")
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{12,}\b/gi, "[credential]");
}

export async function getOrCreateActorForUser(userId: string) {
  const actorHash = hashAiActor(userId, config.aiMemoryKey);
  const existing = await prisma.aiActor.findUnique({ where: { actorHash } });
  if (existing) return existing;
  return prisma.aiActor.create({
    data: {
      userId,
      kind: "user",
      actorHash,
    },
  });
}

export async function ensureDefaultPreferences(actorId: string) {
  await prisma.aiPreference.createMany({
    data: [
      { actorId, key: "memoryEnabled", value: "true" },
      { actorId, key: "personalizationEnabled", value: "true" },
      { actorId, key: "transactionHistoryEnabled", value: "false" },
      { actorId, key: "savedRecipientsEnabled", value: "false" },
    ],
    skipDuplicates: true,
  });
}

export async function getPreferences(actorId: string) {
  const prefs = await prisma.aiPreference.findMany({
    where: { actorId, deletedAt: null },
  });
  return Object.fromEntries(prefs.map((p) => [p.key, p.value]));
}

export async function setPreference(actorId: string, key: string, value: string) {
  return prisma.aiPreference.upsert({
    where: { actorId_key: { actorId, key } },
    update: { value, deletedAt: null },
    create: { actorId, key, value },
  });
}

export async function listMemories(actorId: string) {
  return prisma.aiMemory.findMany({
    where: { actorId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}

export async function deleteMemory(actorId: string, memoryId: string) {
  const m = await prisma.aiMemory.findFirst({
    where: { id: memoryId, actorId, deletedAt: null },
  });
  if (!m) return null;
  return prisma.aiMemory.update({
    where: { id: memoryId },
    data: { deletedAt: new Date() },
  });
}

export async function clearMemories(actorId: string) {
  await prisma.aiMemory.updateMany({
    where: { actorId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
}

export async function upsertMemory(params: {
  actorId: string;
  category: string;
  key?: string;
  summary: string;
  dataJson?: string;
  confidence?: number;
  source?: string;
}) {
  assertNoSecrets(params.summary);
  if (params.dataJson) assertNoSecrets(params.dataJson);

  if (params.key) {
    const existing = await prisma.aiMemory.findFirst({
      where: { actorId: params.actorId, key: params.key, deletedAt: null },
    });
    if (existing) {
      return prisma.aiMemory.update({
        where: { id: existing.id },
        data: {
          category: params.category,
          summary: params.summary,
          dataJson: params.dataJson,
          confidence: params.confidence ?? existing.confidence,
          source: params.source ?? existing.source,
          updatedAt: new Date(),
        },
      });
    }
  }

  return prisma.aiMemory.create({
    data: {
      actorId: params.actorId,
      category: params.category,
      key: params.key,
      summary: params.summary,
      dataJson: params.dataJson,
      confidence: params.confidence ?? 50,
      source: params.source ?? "explicit",
    },
  });
}

export async function retrieveMemories(actorId: string, query: string) {
  assertNoSecrets(query);
  const q = query.toLowerCase();
  const memories = await prisma.aiMemory.findMany({
    where: { actorId, deletedAt: null },
    orderBy: [{ lastUsedAt: "desc" }, { updatedAt: "desc" }],
    take: 50,
  });

  // Simple relevance scoring (privacy-friendly, no embeddings by default).
  const scored = memories
    .map((m) => {
      const hay = `${m.summary} ${m.dataJson ?? ""}`.toLowerCase();
      const hit = hay.includes(q) ? 3 : 0;
      const keyHit = m.key && q.includes(m.key.toLowerCase()) ? 2 : 0;
      const catHit = q.includes(m.category.toLowerCase()) ? 1 : 0;
      const score = hit + keyHit + catHit + Math.min(2, Math.floor(m.confidence / 50));
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.m);

  if (scored.length) {
    await prisma.aiMemory.updateMany({
      where: { id: { in: scored.map((m) => m.id) } },
      data: { lastUsedAt: new Date() },
    });
  }

  return scored;
}

export async function createMessage(params: {
  actorId: string;
  conversationId?: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  contentSummary?: string;
  clientMessageId?: string;
}) {
  assertNoSecrets(params.content);
  if (params.conversationId) {
    const conversation = await prisma.aiConversation.findFirst({
      where: {
        id: params.conversationId,
        actorId: params.actorId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!conversation) throw new Error("AI_CONVERSATION_NOT_FOUND");
  }
  const contentEnc = encryptText(params.content, config.aiMemoryKey);
  const message = await prisma.aiMessage.create({
    data: {
      actorId: params.actorId,
      conversationId: params.conversationId ?? null,
      role: params.role,
      contentEnc,
      contentSummary: redactAiSummary(params.contentSummary ?? params.content),
      clientMessageId: params.clientMessageId,
    },
  });
  if (params.conversationId) {
    const current = await prisma.aiConversation.findUnique({
      where: { id: params.conversationId },
      select: { title: true },
    });
    const shouldTitle =
      params.role === "user" &&
      (!current?.title || current.title === "Coretta session");
    await prisma.aiConversation.update({
      where: { id: params.conversationId },
      data: {
        updatedAt: new Date(),
        ...(shouldTitle
          ? { title: redactAiSummary(params.content).trim().slice(0, 80) }
          : {}),
      },
    });
  }
  return message;
}

export async function createConversation(actorId: string, title?: string) {
  return prisma.aiConversation.create({
    data: { actorId, title: title ? redactAiSummary(title) : undefined },
  });
}

export async function listConversations(actorId: string) {
  return prisma.aiConversation.findMany({
    where: { actorId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { contentSummary: true },
      },
      _count: { select: { messages: true } },
    },
  });
}

export async function getConversationMessages(actorId: string, conversationId: string) {
  const conversation = await prisma.aiConversation.findFirst({
    where: { id: conversationId, actorId, deletedAt: null },
    include: {
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        take: 500,
      },
    },
  });
  if (!conversation) return null;
  return {
    ...conversation,
    messages: conversation.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: decryptText(message.contentEnc, config.aiMemoryKey),
      createdAt: message.createdAt,
    })),
  };
}

export async function setConversationStatus(params: {
  actorId: string;
  conversationId: string;
  status: "ACTIVE" | "ARCHIVED";
}) {
  const result = await prisma.aiConversation.updateMany({
    where: { id: params.conversationId, actorId: params.actorId, deletedAt: null },
    data: { status: params.status },
  });
  return result.count > 0;
}

export async function createFeedback(params: {
  actorId: string;
  kind: "thumbs" | "report";
  rating?: 1 | -1;
  messageId?: string | null;
  issueType?: string | null;
  comment?: string | null;
  contextJson?: string | null;
}) {
  if (params.comment) assertNoSecrets(params.comment);
  if (params.contextJson) assertNoSecrets(params.contextJson);
  if (params.messageId) {
    const message = await prisma.aiMessage.findFirst({
      where: { id: params.messageId, actorId: params.actorId, deletedAt: null },
      select: { id: true },
    });
    if (!message) throw new Error("AI_MESSAGE_NOT_FOUND");
  }
  const commentEnc = params.comment
    ? encryptText(params.comment, config.aiMemoryKey)
    : null;

  return prisma.aiFeedback.create({
    data: {
      actorId: params.actorId,
      kind: params.kind,
      rating: params.rating ?? null,
      messageId: params.messageId ?? null,
      issueType: params.issueType ?? null,
      commentEnc,
      contextJson: params.contextJson
        ? redactSensitiveIdentifiers(params.contextJson).slice(0, 5_000)
        : null,
    },
  });
}

