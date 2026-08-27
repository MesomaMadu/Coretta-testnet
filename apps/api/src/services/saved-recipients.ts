import { prisma } from "@coretta/db";
import { getAddress, isAddress } from "viem";

export const ARC_TESTNET_NETWORK = "arc-testnet";
const MAX_LABEL_LENGTH = 80;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

export function normalizeRecipientLabel(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function normalizeRecipientLookup(value: string): string {
  return normalizeRecipientLabel(value)
    .replace(/[’']s\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateRecipientLabel(value: string): string {
  const label = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!label) throw new Error("RECIPIENT_LABEL_REQUIRED");
  if (label.length > MAX_LABEL_LENGTH) throw new Error("RECIPIENT_LABEL_TOO_LONG");
  if (CONTROL_CHARACTERS.test(label)) throw new Error("RECIPIENT_LABEL_INVALID");
  return label;
}

export function normalizeRecipientAddress(value: string): string {
  const address = value.trim();
  if (!isAddress(address)) throw new Error("RECIPIENT_ADDRESS_INVALID");
  return getAddress(address);
}

export async function listSavedRecipients(userId: string) {
  return prisma.savedRecipient.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ normalizedLabel: "asc" }, { isPreferred: "desc" }, { updatedAt: "desc" }],
    take: 200,
  });
}

export async function resolveSavedRecipient(params: {
  userId: string;
  label: string;
  network?: string;
}) {
  const normalizedLabel = normalizeRecipientLookup(params.label);
  const network = params.network ?? ARC_TESTNET_NETWORK;
  let matches = await prisma.savedRecipient.findMany({
    where: {
      userId: params.userId,
      normalizedLabel: {
        in: Array.from(
          new Set([normalizeRecipientLabel(params.label), normalizedLabel]),
        ),
      },
      network,
      deletedAt: null,
    },
    orderBy: [{ isPreferred: "desc" }, { lastUsedAt: "desc" }, { updatedAt: "desc" }],
    take: 20,
  });

  if (matches.length === 0 && normalizedLabel.length >= 3) {
    matches = await prisma.savedRecipient.findMany({
      where: {
        userId: params.userId,
        normalizedLabel: { contains: normalizedLabel },
        network,
        deletedAt: null,
      },
      orderBy: [{ isPreferred: "desc" }, { lastUsedAt: "desc" }, { updatedAt: "desc" }],
      take: 20,
    });
  }

  if (matches.length <= 1) return { status: matches.length ? "resolved" : "not_found", matches };
  const preferred = matches.filter((recipient) => recipient.isPreferred);
  if (preferred.length === 1) return { status: "resolved", matches: preferred };
  return { status: "ambiguous", matches };
}

export async function saveRecipient(params: {
  userId: string;
  label: string;
  address: string;
  network?: string;
  isPreferred?: boolean;
  createdFromTransferId?: string | null;
}) {
  const label = validateRecipientLabel(params.label);
  const normalizedLabel = normalizeRecipientLabel(label);
  const address = normalizeRecipientAddress(params.address);
  const normalizedAddress = address.toLowerCase();
  const network = params.network ?? ARC_TESTNET_NETWORK;

  const existing = await prisma.savedRecipient.findFirst({
    where: {
      userId: params.userId,
      normalizedLabel,
      normalizedAddress,
      network,
      deletedAt: null,
    },
  });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    if (params.isPreferred) {
      await tx.savedRecipient.updateMany({
        where: { userId: params.userId, normalizedLabel, network, deletedAt: null },
        data: { isPreferred: false },
      });
    }
    return tx.savedRecipient.create({
      data: {
        userId: params.userId,
        label,
        normalizedLabel,
        address,
        normalizedAddress,
        network,
        source: "USER_CONFIRMED",
        isPreferred: params.isPreferred ?? false,
        createdFromTransferId: params.createdFromTransferId ?? null,
      },
    });
  });
}

export async function updateSavedRecipient(params: {
  userId: string;
  recipientId: string;
  label?: string;
  address?: string;
  isPreferred?: boolean;
}) {
  const current = await prisma.savedRecipient.findFirst({
    where: { id: params.recipientId, userId: params.userId, deletedAt: null },
  });
  if (!current) return null;

  const label = params.label === undefined ? current.label : validateRecipientLabel(params.label);
  const normalizedLabel = normalizeRecipientLabel(label);
  const address =
    params.address === undefined ? current.address : normalizeRecipientAddress(params.address);

  return prisma.$transaction(async (tx) => {
    if (params.isPreferred) {
      await tx.savedRecipient.updateMany({
        where: {
          userId: params.userId,
          normalizedLabel,
          network: current.network,
          deletedAt: null,
        },
        data: { isPreferred: false },
      });
    }
    return tx.savedRecipient.update({
      where: { id: current.id },
      data: {
        label,
        normalizedLabel,
        address,
        normalizedAddress: address.toLowerCase(),
        ...(params.isPreferred === undefined ? {} : { isPreferred: params.isPreferred }),
      },
    });
  });
}

export async function forgetSavedRecipient(userId: string, recipientId: string) {
  const current = await prisma.savedRecipient.findFirst({
    where: { id: recipientId, userId, deletedAt: null },
  });
  if (!current) return null;
  return prisma.savedRecipient.update({
    where: { id: current.id },
    data: { deletedAt: new Date(), isPreferred: false },
  });
}

export async function recordSavedRecipientUse(userId: string, recipientId: string) {
  await prisma.savedRecipient.updateMany({
    where: { id: recipientId, userId, deletedAt: null },
    data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
  });
}
