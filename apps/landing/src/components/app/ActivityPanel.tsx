"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import {
  formatAbsoluteTime,
  useActivityFeed,
  type ActivityItem,
} from "@/hooks/useActivityFeed";

export default function ActivityPanel() {
  const [query, setQuery] = useState("");
  const { items, identityConnected, hasApiSession, loading, loadError, refresh } =
    useActivityFeed();
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      [item.label, item.asset, item.amount, item.recipient, item.network, item.state]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [items, query]);

  const emptyMessage = !identityConnected
    ? "Sign in to view your activity."
    : !hasApiSession
      ? "Your Coretta session has expired. Sign in again to continue."
      : loadError ?? "No activity matches this search.";

  return (
    <div className="h-full overflow-y-auto bg-[#F7F5FA] px-4 py-5 text-[#17131F] sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[88rem]">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#211D32]/8 pb-5">
          <div>
            <p className="text-xs text-[#746D80]">Coretta records</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Activity</h1>
            <p className="mt-1 text-sm text-[#746D80]">Every send, swap, and bridge in one place.</p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <label className="relative min-w-0 flex-1 sm:w-72">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#91899D]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search activity"
                className="h-10 w-full rounded-full bg-[#ECE9EF] pl-11 pr-4 text-sm outline-none ring-[#7C4DFF]/25 transition focus:bg-white focus:ring-2"
              />
            </label>
            <button
              type="button"
              onClick={refresh}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#211D32] text-white"
              aria-label="Refresh activity"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </header>

        <section className="mt-6 overflow-hidden rounded-[1.8rem] border border-[#211D32]/8 bg-white p-4 shadow-[0_18px_45px_rgba(41,35,62,0.08)] sm:p-6">
          <div className="overflow-x-auto">
            <div className="min-w-[48rem]">
              <div className="grid grid-cols-[minmax(0,1.45fr)_10rem_8rem_9rem_2rem] px-4 pb-3 text-[10px] font-medium uppercase tracking-[0.12em] text-[#9A93A3]">
                <span>Activity</span><span>Date</span><span>Status</span><span className="text-right">Amount</span><span />
              </div>
              <div className="space-y-2">
                {filtered.map((item) => <ActivityTableRow key={item.id} item={item} />)}
                {!filtered.length && (
                  <p className="rounded-2xl bg-[#F7F5FA] px-4 py-12 text-center text-sm text-[#81798C]">
                    {loading ? "Loading activity" : emptyMessage}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ActivityTableRow({ item }: { item: ActivityItem }) {
  const StatusIcon = item.status === "complete" ? CheckCircle2 : item.status === "failed" ? XCircle : Clock3;
  const statusClass = item.status === "complete" ? "bg-[#DDF5E8] text-[#17734D]" : item.status === "failed" ? "bg-[#FFE2E4] text-[#B32631]" : "bg-[#F2EFF5] text-[#716978]";
  const received = /receive/i.test(item.label);
  return (
    <div className="grid grid-cols-[minmax(0,1.45fr)_10rem_8rem_9rem_2rem] items-center rounded-2xl bg-[#F8F7F9] px-4 py-3 text-xs transition hover:bg-[#F3F0F6]">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${received ? "bg-[#E7F7F0] text-[#17734D]" : "bg-[#EEE9FF] text-[#603ADB]"}`}>
          {received ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-[#302A3B]">{item.label}</p>
          <p className="mt-0.5 truncate text-[10px] text-[#91899D]">{item.recipient ?? item.network ?? "Arc Testnet"}</p>
        </div>
      </div>
      <span className="text-[10px] text-[#81798C]">{formatAbsoluteTime(item.timestamp)}</span>
      <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass}`}>
        <StatusIcon className="h-3 w-3" /> {item.status}
      </span>
      <span className="truncate text-right font-semibold text-[#302A3B]">{item.amount ?? "0"} {item.asset ?? ""}</span>
      {item.explorerUrl ? (
        <a href={item.explorerUrl} target="_blank" rel="noreferrer" className="text-[#756D80] hover:text-[#5C35D6]" aria-label="Open transaction explorer">
          <ExternalLink className="h-4 w-4" />
        </a>
      ) : <span />}
    </div>
  );
}
