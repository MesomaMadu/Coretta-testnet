"use client";

import { Bell, Check, Clock3, ExternalLink, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, getApiToken } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Approval = {
  id: string;
  transferId: string;
  direction: "incoming" | "outgoing";
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "POLICY_DENIED";
  amount: string;
  asset: string;
  counterparty: string;
  createdAt: string;
  expiresAt: string;
  transferState: string;
  txHash?: string;
  explorerUrl?: string;
  failureReason?: string;
};

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

export default function ApprovalsPanel() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    if (!getApiToken()) {
      setApprovals([]);
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      refreshingRef.current = false;
      return;
    }
    try {
      const [approvalResult, notificationResult] = await Promise.all([
        apiFetch<{ approvals: Approval[] }>("/v1/approvals"),
        apiFetch<{ notifications: NotificationItem[]; unreadCount: number }>(
          "/v1/notifications",
        ),
      ]);
      setApprovals(approvalResult.approvals);
      setNotifications(notificationResult.notifications);
      setUnreadCount(notificationResult.unreadCount);
      setError(null);
      window.dispatchEvent(
        new CustomEvent("coretta-notifications-count", {
          detail: { count: notificationResult.unreadCount },
        }),
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load approvals.");
    } finally {
      setLoading(false);
      refreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    const onSessionUpdated = () => {
      setLoading(true);
      void refresh();
    };
    window.addEventListener("coretta-api-session-updated", onSessionUpdated);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("coretta-api-session-updated", onSessionUpdated);
    };
  }, [refresh]);

  const decide = async (approval: Approval, decision: "accept" | "reject") => {
    if (decision === "reject" && !window.confirm("Reject this payment request? This cannot be undone.")) {
      return;
    }
    setBusyId(approval.id);
    try {
      await apiFetch(`/v1/approvals/${approval.id}/${decision}`, { method: "POST" });
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The approval could not be updated.");
    } finally {
      setBusyId(null);
    }
  };

  const markAllRead = async () => {
    await apiFetch("/v1/notifications/read-all", { method: "POST" });
    await refresh();
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/40">Payments</p>
            <h1 className="mt-1 text-2xl font-semibold text-black">Approvals and notifications</h1>
            <p className="mt-1 max-w-2xl text-sm text-black/55">
              Coretta-to-Coretta payments wait here for the recipient. Requests expire after 24 hours.
            </p>
          </div>
          <Button variant="glass" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-500/25 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
            {error}
          </p>
        )}

        <section className="mt-7">
          <h2 className="text-sm font-semibold text-black">Payment approvals</h2>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {approvals.map((approval) => (
              <article key={approval.id} className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-black/45">
                      {approval.direction === "incoming" ? "Incoming request from" : "Outgoing request to"}
                    </p>
                    <p className="mt-0.5 break-all text-sm font-medium text-black">{approval.counterparty}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                    approval.status === "PENDING"
                      ? "bg-amber-100 text-amber-900"
                      : approval.status === "ACCEPTED"
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-black/5 text-black/55"
                  }`}>
                    {approval.status.toLowerCase()}
                  </span>
                </div>
                <p className="mt-4 text-2xl font-semibold text-black">
                  {approval.amount} <span className="text-base text-black/50">{approval.asset}</span>
                </p>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-black/45">
                  <Clock3 className="h-3.5 w-3.5" />
                  {approval.status === "PENDING"
                    ? `Expires ${new Date(approval.expiresAt).toLocaleString()}`
                    : `Created ${new Date(approval.createdAt).toLocaleString()}`}
                </div>
                {approval.failureReason && <p className="mt-2 text-xs text-rose-700">{approval.failureReason}</p>}
                {approval.explorerUrl && (
                  <a href={approval.explorerUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-black underline underline-offset-2">
                    View on Arc explorer <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {approval.direction === "incoming" && approval.status === "PENDING" && (
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      className="flex-1"
                      disabled={busyId === approval.id}
                      onClick={() => void decide(approval, "accept")}
                    >
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      Accept
                    </Button>
                    <Button
                      variant="glass"
                      size="sm"
                      className="flex-1"
                      disabled={busyId === approval.id}
                      onClick={() => void decide(approval, "reject")}
                    >
                      <X className="mr-1.5 h-3.5 w-3.5" />
                      Reject
                    </Button>
                  </div>
                )}
              </article>
            ))}
            {loading && !approvals.length ? (
              <p className="rounded-2xl border border-dashed border-black/15 bg-white p-8 text-center text-sm text-black/45 lg:col-span-2">
                Loading approvals…
              </p>
            ) : !approvals.length && (
              <p className="rounded-2xl border border-dashed border-black/15 bg-white p-8 text-center text-sm text-black/45 lg:col-span-2">
                No Coretta-to-Coretta approval requests yet.
              </p>
            )}
          </div>
        </section>

        <section className="mt-8 pb-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-black">
              <Bell className="h-4 w-4" /> Notifications
              {unreadCount > 0 && <span className="rounded-full bg-black px-2 py-0.5 text-[10px] text-white">{unreadCount}</span>}
            </h2>
            {unreadCount > 0 && (
              <button type="button" onClick={() => void markAllRead()} className="text-xs text-black/55 underline underline-offset-2 hover:text-black">
                Mark all read
              </button>
            )}
          </div>
          <div className="mt-3 divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/10 bg-white">
            {notifications.map((notification) => (
              <div key={notification.id} className={`p-4 ${notification.read ? "" : "bg-violet-50/50"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-black">{notification.title}</p>
                    <p className="mt-1 text-xs text-black/55">{notification.body}</p>
                  </div>
                  {!notification.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-violet-600" aria-label="Unread" />}
                </div>
                <time className="mt-2 block text-[10px] text-black/35" dateTime={notification.createdAt}>
                  {new Date(notification.createdAt).toLocaleString()}
                </time>
              </div>
            ))}
            {!notifications.length && <p className="p-8 text-center text-sm text-black/45">No notifications yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
