"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  CircleX,
  Globe2,
  LayoutDashboard,
  MousePointer2,
  Play,
  RotateCcw,
  Settings,
  WalletCards,
} from "lucide-react";
import CRLogo from "@/components/shared/CRLogo";
import styles from "./dashboard.module.css";

const DURATION_MS = 10_000;
const BAR_HEIGHTS = [38, 52, 44, 70, 61, 85, 94];

const TRANSACTIONS = [
  { name: "Sent to Amara O.", meta: "2 minutes ago", amount: "−45.00 USDC", status: "Settled" },
  { name: "Received from 0x71…09fB", meta: "1 hour ago", amount: "+120.00 USDC", status: "Settled" },
  { name: "Sent to Julian K.", meta: "3 hours ago", amount: "−18.50 USDC", status: "Pending" },
  { name: "Sent to 0x4a1c…88e2", meta: "Yesterday", amount: "−12.00 USDC", status: "Failed" },
] as const;

type CursorTarget = "range" | "activity" | "wallet" | "rpc" | "idle";

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function animateValue(elapsed: number, start: number, duration: number, from: number, to: number) {
  const progress = Math.max(0, Math.min((elapsed - start) / duration, 1));
  return from + (to - from) * easeOutCubic(progress);
}

function formatAmount(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CorettaDashboardDemo() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ x: 500, y: 70 });
  const frameRef = useRef<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<HTMLButtonElement>(null);
  const activityRef = useRef<HTMLButtonElement>(null);
  const walletRef = useRef<HTMLButtonElement>(null);
  const rpcRef = useRef<HTMLDivElement>(null);

  const cursorTarget: CursorTarget =
    elapsed >= 6_800
      ? "rpc"
      : elapsed >= 5_900
        ? "wallet"
        : elapsed >= 4_900
          ? "activity"
          : elapsed >= 3_800
            ? "range"
            : "idle";

  const play = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);

    setElapsed(0);
    setRunning(true);
    const startedAt = performance.now();

    const tick = (now: number) => {
      const nextElapsed = Math.min(now - startedAt, DURATION_MS);
      setElapsed(nextElapsed);

      if (nextElapsed < DURATION_MS) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
        setRunning(false);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const targets = {
      range: rangeRef.current,
      activity: activityRef.current,
      wallet: walletRef.current,
      rpc: rpcRef.current,
      idle: null,
    };
    const target = targets[cursorTarget];
    if (!stage || !target) return;

    const stageRect = stage.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    setCursorPosition({
      x: targetRect.left - stageRect.left + targetRect.width / 2 - 2,
      y: targetRect.top - stageRect.top + targetRect.height / 2 - 2,
    });
  }, [cursorTarget]);

  const walletVisible = elapsed >= 80;
  const activityVisible = elapsed >= 220;
  const transactionsVisible = elapsed >= 420;
  const networkVisible = elapsed >= 560;
  const walletResolved = elapsed >= 400;
  const walletActionVisible = elapsed >= 950;
  const rangeVisible = elapsed >= 1_500;
  const lastThirtyDays = elapsed >= 4_380;
  const cursorVisible = running && elapsed >= 3_800 && elapsed < 8_150;
  const cursorClicking =
    (elapsed >= 4_210 && elapsed < 4_610) ||
    (elapsed >= 5_310 && elapsed < 5_710) ||
    (elapsed >= 6_310 && elapsed < 6_710);

  const walletBalance = animateValue(elapsed, 400, 550, 0, 2_480.32);
  const sevenDayTransactions = animateValue(elapsed, 700, 480, 0, 128);
  const sevenDayVolume = animateValue(elapsed, 700, 500, 0, 4_320.75);
  const successRate = animateValue(elapsed, 700, 520, 0, 98.4);
  const transactionCount = lastThirtyDays
    ? animateValue(elapsed, 4_380, 350, 128, 471)
    : sevenDayTransactions;
  const volume = lastThirtyDays
    ? animateValue(elapsed, 4_380, 350, 4_320.75, 16_820.4)
    : sevenDayVolume;
  const progress = Math.min((elapsed / DURATION_MS) * 100, 100);

  return (
    <main className={styles.demo}>
      <header className={styles.demoHeader}>
        <p className={styles.eyebrow}>Coretta concept</p>
        <h1>Dashboard interaction demo</h1>
        <p>A consolidated view of a smart wallet, transfer activity, and Arc service status.</p>
      </header>

      <section className={styles.demoShell} aria-label="Coretta dashboard interaction">
        <div className={styles.stage} ref={stageRef}>
          <div className={styles.app}>
            <aside className={styles.sidebar} aria-label="Coretta dashboard navigation">
              <div className={styles.brand}>
                <div className={styles.brandMark}>
                  <CRLogo size="sm" animate={false} />
                </div>
                <span>Coretta</span>
              </div>

              <nav className={styles.nav} aria-label="Dashboard demo navigation">
                <NavItem icon={LayoutDashboard} label="Dashboard" active />
                <NavItem icon={WalletCards} label="Wallet" />
                <NavItem icon={Activity} label="Activity" />
                <NavItem icon={Globe2} label="Network" />
                <NavItem icon={Settings} label="Settings" />
              </nav>

              <div className={styles.sidebarNote}>
                <span />
                Sample workspace
              </div>
            </aside>

            <div className={styles.dashboard}>
              <div className={styles.dashboardHeader}>
                <div>
                  <p>Overview</p>
                  <h2>Dashboard</h2>
                </div>
                <div className={styles.networkTag}>
                  <span />
                  Arc Testnet
                </div>
              </div>

              <div className={styles.grid}>
                <article className={`${styles.card} ${walletVisible ? styles.cardVisible : ""}`}>
                  <div className={styles.cardHeader}>
                    <div>
                      <span className={styles.cardEyebrow}>Smart wallet</span>
                      <strong>Managed balance</strong>
                    </div>
                    <div className={styles.iconBox}>
                      <WalletCards aria-hidden="true" />
                    </div>
                  </div>

                  <div className={styles.walletBody}>
                    <span>Total balance</span>
                    {walletResolved ? (
                      <strong>{formatAmount(walletBalance)} <small>USDC</small></strong>
                    ) : (
                      <span className={styles.skeletonBalance} aria-label="Loading balance" />
                    )}
                    <p>0x9F3a…21c4 · Arc Testnet</p>
                  </div>

                  <button
                    type="button"
                    className={`${styles.textAction} ${walletActionVisible ? styles.actionVisible : ""} ${elapsed >= 6_310 && elapsed < 6_710 ? styles.actionPressed : ""}`}
                    tabIndex={-1}
                    ref={walletRef}
                  >
                    View wallet details <ArrowRight aria-hidden="true" />
                  </button>
                </article>

                <article className={`${styles.card} ${activityVisible ? styles.cardVisible : ""}`}>
                  <div className={styles.cardHeader}>
                    <div>
                      <span className={styles.cardEyebrow}>Activity overview</span>
                      <strong>Transfer performance</strong>
                    </div>
                    <button
                      type="button"
                      className={`${styles.rangeChip} ${rangeVisible ? styles.rangeVisible : ""} ${elapsed >= 4_210 && elapsed < 4_610 ? styles.rangePressed : ""}`}
                      tabIndex={-1}
                      ref={rangeRef}
                    >
                      {lastThirtyDays ? "Last 30 days" : "Last 7 days"}
                    </button>
                  </div>

                  <div className={styles.stats}>
                    <Stat label="Transfers" value={Math.round(transactionCount).toString()} />
                    <Stat label="Volume sent" value={`${formatAmount(volume)} USDC`} />
                    <Stat label="Success rate" value={`${successRate.toFixed(1)}%`} trend="+12.4%" />
                  </div>

                  <div className={styles.chart} aria-label="Sample transfer activity chart">
                    {BAR_HEIGHTS.map((height, index) => {
                      const barVisible = elapsed >= 1_050 + index * 55;
                      return (
                        <span
                          key={height}
                          className={barVisible ? styles.barVisible : ""}
                          style={{ height: barVisible ? `${height}%` : "0%" }}
                        />
                      );
                    })}
                  </div>
                </article>

                <article className={`${styles.card} ${styles.transactionCard} ${transactionsVisible ? styles.cardVisible : ""}`}>
                  <div className={styles.cardHeader}>
                    <div>
                      <span className={styles.cardEyebrow}>Recent activity</span>
                      <strong>Latest transfers</strong>
                    </div>
                  </div>

                  <div className={styles.transactionList}>
                    {TRANSACTIONS.map((transaction, index) => (
                      <TransactionRow
                        key={transaction.name}
                        {...transaction}
                        visible={elapsed >= 1_600 + index * 150}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    className={`${styles.textAction} ${elapsed >= 2_350 ? styles.actionVisible : ""} ${elapsed >= 5_310 && elapsed < 5_710 ? styles.actionPressed : ""}`}
                    tabIndex={-1}
                    ref={activityRef}
                  >
                    View all activity <ArrowRight aria-hidden="true" />
                  </button>
                </article>

                <article className={`${styles.card} ${styles.networkCard} ${networkVisible ? styles.cardVisible : ""}`}>
                  <div className={styles.networkHeader}>
                    <div>
                      <span className={styles.cardEyebrow}>Infrastructure</span>
                      <strong>Arc services</strong>
                    </div>
                    <span className={styles.demoStatus}>Demo status</span>
                  </div>

                  <div className={styles.serviceList}>
                    <ServiceRow label="Arc RPC" readyAt={2_200} elapsed={elapsed} rowRef={rpcRef} />
                    <ServiceRow label="Bundler" readyAt={2_450} elapsed={elapsed} />
                    <ServiceRow label="Circle Wallets" readyAt={2_700} elapsed={elapsed} />
                    <ServiceRow label="Circle Paymaster" readyAt={2_950} elapsed={elapsed} monitoring />
                  </div>

                  <div className={`${styles.tooltip} ${elapsed >= 7_200 && elapsed < 8_000 ? styles.tooltipVisible : ""}`}>
                    Sample check · 12 seconds ago
                  </div>
                </article>
              </div>
            </div>

            <MousePointer2
              className={`${styles.cursor} ${cursorVisible ? styles.cursorVisible : ""} ${cursorClicking ? styles.cursorClicking : ""}`}
              style={{ transform: `translate(${cursorPosition.x}px, ${cursorPosition.y}px)` }}
              aria-hidden="true"
            />
          </div>
        </div>

        <div className={styles.controls}>
          <button type="button" className={styles.playButton} onClick={play} disabled={running}>
            {elapsed >= DURATION_MS ? <RotateCcw aria-hidden="true" /> : <Play aria-hidden="true" />}
            {running ? "Playing" : elapsed >= DURATION_MS ? "Replay demo" : "Play demo"}
          </button>
          <div className={styles.timeline}>
            <div className={styles.progressTrack} aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </div>
            <span className={styles.timer}>{(elapsed / 1_000).toFixed(1)}s / 10s</span>
          </div>
        </div>
      </section>

      <p className={styles.disclaimer}>Illustrative dashboard only. Balances, activity, and service states are sample data.</p>
    </main>
  );
}

function NavItem({
  icon: Icon,
  label,
  active = false,
}: {
  icon: typeof LayoutDashboard;
  label: string;
  active?: boolean;
}) {
  return (
    <div className={`${styles.navItem} ${active ? styles.navActive : ""}`}>
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function Stat({ label, value, trend }: { label: string; value: string; trend?: string }) {
  return (
    <div className={styles.stat}>
      <span>{label}</span>
      <strong>{value}</strong>
      {trend ? <small>{trend}</small> : null}
    </div>
  );
}

function TransactionRow({
  name,
  meta,
  amount,
  status,
  visible,
}: {
  name: string;
  meta: string;
  amount: string;
  status: "Settled" | "Pending" | "Failed";
  visible: boolean;
}) {
  const StatusIcon = status === "Settled" ? CheckCircle2 : status === "Pending" ? CircleAlert : CircleX;

  return (
    <div className={`${styles.transactionRow} ${visible ? styles.transactionVisible : ""}`}>
      <div>
        <strong>{name}</strong>
        <span>{meta}</span>
      </div>
      <div className={styles.transactionRight}>
        <strong>{amount}</strong>
        <span className={styles[`status${status}`]}>
          <StatusIcon aria-hidden="true" />
          {status}
        </span>
      </div>
    </div>
  );
}

function ServiceRow({
  label,
  readyAt,
  elapsed,
  monitoring = false,
  rowRef,
}: {
  label: string;
  readyAt: number;
  elapsed: number;
  monitoring?: boolean;
  rowRef?: React.Ref<HTMLDivElement>;
}) {
  const ready = elapsed >= readyAt;

  return (
    <div className={styles.serviceRow} ref={rowRef}>
      <span>{label}</span>
      <span className={ready ? (monitoring ? styles.serviceMonitoring : styles.serviceHealthy) : styles.serviceChecking}>
        <i />
        {ready ? (monitoring ? "Monitoring" : "Healthy") : "Checking"}
      </span>
    </div>
  );
}
