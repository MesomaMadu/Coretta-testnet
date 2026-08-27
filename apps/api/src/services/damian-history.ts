import { prisma } from "@coretta/db";
import { formatMicroToUsdc } from "@coretta/shared";

const SETTLED_STATES = ["SETTLED", "INCLUDED"];

export const HISTORY_PERIODS = [
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "this_month",
  "last_month",
] as const;

export type HistoryPeriod = (typeof HISTORY_PERIODS)[number];

export function resolveHistoryPeriod(
  period: HistoryPeriod | undefined,
  timezoneOffsetMinutes = 0,
  now = new Date(),
) {
  if (!period) return {};
  const boundedOffset = Math.min(Math.max(timezoneOffsetMinutes, -840), 840);
  const shiftedNow = new Date(now.getTime() - boundedOffset * 60_000);
  const startOfShiftedDay = new Date(
    Date.UTC(
      shiftedNow.getUTCFullYear(),
      shiftedNow.getUTCMonth(),
      shiftedNow.getUTCDate(),
    ),
  );
  const toUtc = (shiftedDate: Date) =>
    new Date(shiftedDate.getTime() + boundedOffset * 60_000);

  if (period === "today") {
    return { since: toUtc(startOfShiftedDay) };
  }
  if (period === "yesterday") {
    const since = new Date(startOfShiftedDay);
    since.setUTCDate(since.getUTCDate() - 1);
    return { since: toUtc(since), until: toUtc(startOfShiftedDay) };
  }
  if (period === "last_7_days" || period === "last_30_days") {
    const since = new Date(startOfShiftedDay);
    since.setUTCDate(since.getUTCDate() - (period === "last_7_days" ? 6 : 29));
    return { since: toUtc(since) };
  }

  const thisMonth = new Date(
    Date.UTC(shiftedNow.getUTCFullYear(), shiftedNow.getUTCMonth(), 1),
  );
  if (period === "this_month") {
    return { since: toUtc(thisMonth) };
  }
  const lastMonth = new Date(
    Date.UTC(shiftedNow.getUTCFullYear(), shiftedNow.getUTCMonth() - 1, 1),
  );
  return { since: toUtc(lastMonth), until: toUtc(thisMonth) };
}

export async function searchUserTransfers(params: {
  userId: string;
  direction?: "sent" | "received";
  states?: string[];
  since?: Date;
  until?: Date;
  destinationAddresses?: string[];
  limit?: number;
}) {
  const direction = params.direction ?? "sent";
  const addressFilter = params.destinationAddresses?.map((address) => address.toLowerCase());
  const transfers = await prisma.transfer.findMany({
    where: {
      ...(direction === "sent"
        ? { senderUserId: params.userId }
        : { recipientUserId: params.userId }),
      ...(params.states?.length ? { state: { in: params.states } } : {}),
      ...(params.since || params.until
        ? {
            createdAt: {
              ...(params.since ? { gte: params.since } : {}),
              ...(params.until ? { lt: params.until } : {}),
            },
          }
        : {}),
      ...(addressFilter?.length
        ? { destinationAddress: { in: addressFilter, mode: "insensitive" } }
        : {}),
    },
    include: { senderWallet: true, recipientWallet: true },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(params.limit ?? 20, 1), 50),
  });

  return transfers.map((transfer) => ({
    id: transfer.id,
    amount: formatMicroToUsdc(transfer.amountMicro),
    amountMicro: transfer.amountMicro,
    asset: transfer.asset,
    network: transfer.network,
    state: transfer.state,
    destinationAddress:
      transfer.destinationAddress ?? transfer.recipientWallet?.scaAddress ?? null,
    txHash: transfer.txHash,
    failureReason: transfer.failureReason ?? transfer.policyReason,
    createdAt: transfer.createdAt,
    settledAt: transfer.settledAt,
  }));
}

export async function getLastSettledTransfer(
  userId: string,
  range: { since?: Date; until?: Date } = {},
) {
  const [transfer] = await searchUserTransfers({
    userId,
    direction: "sent",
    states: SETTLED_STATES,
    ...range,
    limit: 1,
  });
  return transfer ?? null;
}

export async function sumSettledTransfersTo(params: {
  userId: string;
  addresses: string[];
  since?: Date;
  until?: Date;
}) {
  const grouped = await prisma.transfer.groupBy({
    by: ["asset"],
    where: {
      senderUserId: params.userId,
      state: { in: SETTLED_STATES },
      destinationAddress: { in: params.addresses, mode: "insensitive" },
      ...(params.since || params.until
        ? {
            createdAt: {
              ...(params.since ? { gte: params.since } : {}),
              ...(params.until ? { lt: params.until } : {}),
            },
          }
        : {}),
    },
    _sum: { amountMicro: true },
    _count: { _all: true },
  });
  return grouped.map((group) => ({
    asset: group.asset,
    amountMicro: group._sum.amountMicro ?? 0n,
    amount: formatMicroToUsdc(group._sum.amountMicro ?? 0n),
    count: group._count._all,
  }));
}

export function settledTransferStates() {
  return [...SETTLED_STATES];
}
