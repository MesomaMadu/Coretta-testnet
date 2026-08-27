"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  History,
  Home,
  MessageCircle,
  MousePointer2,
  Play,
  RotateCcw,
  Settings,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import CRLogo from "@/components/shared/CRLogo";
import styles from "./demo.module.css";

const DURATION_MS = 10_000;

type CursorPosition = { x: number; y: number };

export default function DamianChatDemo() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({ x: 35, y: 190 });
  const frameRef = useRef<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const chatButtonRef = useRef<HTMLButtonElement>(null);
  const reviewButtonRef = useRef<HTMLButtonElement>(null);

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
    const target = elapsed >= 6_900 ? reviewButtonRef.current : chatButtonRef.current;
    if (!stage || !target) return;

    const stageRect = stage.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    setCursorPosition({
      x: targetRect.left - stageRect.left + targetRect.width / 2 - 2,
      y: targetRect.top - stageRect.top + targetRect.height / 2 - 2,
    });
  }, [elapsed >= 6_900]);

  const headlineVisible = elapsed >= 500 && elapsed < 2_820;
  const headlineRetracting = elapsed >= 2_500 && elapsed < 2_820;
  const chatOpen = elapsed >= 2_500;
  const showUserMessage = elapsed >= 3_250;
  const showTyping = elapsed >= 3_650 && elapsed < 4_150;
  const showAssistantMessage = elapsed >= 4_150;
  const showTransferCard = elapsed >= 5_050;
  const reviewPressed = elapsed >= 7_420;
  const showReadyMessage = elapsed >= 7_680;
  const readyForSignature = elapsed >= 8_550;
  const cursorVisible = running && elapsed >= 60 && elapsed < 9_000;
  const cursorClicking =
    (elapsed >= 440 && elapsed < 820) || (elapsed >= 7_400 && elapsed < 7_820);
  const seconds = Math.min(elapsed / 1_000, 10);
  const progress = Math.min((elapsed / DURATION_MS) * 100, 100);

  return (
    <main className={styles.demo}>
      <header className={styles.demoHeader}>
        <p className={styles.eyebrow}>Damian + Coretta</p>
        <h1>Chat interaction demo</h1>
        <p>From a natural-language request to a transfer that is ready for your signature.</p>
      </header>

      <section className={styles.demoShell} aria-label="Damian chat interaction">
        <div className={styles.stage} ref={stageRef}>
          <div className={`${styles.app} ${elapsed >= 500 ? styles.focused : ""}`}>
            <aside className={styles.sidebar} aria-label="Coretta navigation preview">
              <div className={styles.brandMark} aria-label="Coretta">
                <CRLogo size="sm" animate={false} />
              </div>
              <nav className={styles.nav} aria-label="Demo navigation">
                <button type="button" className={styles.navItem} aria-label="Home" tabIndex={-1}>
                  <Home aria-hidden="true" />
                </button>
                <button type="button" className={styles.navItem} aria-label="Wallet" tabIndex={-1}>
                  <WalletCards aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`${styles.navItem} ${styles.chatTrigger} ${cursorClicking && elapsed < 1_000 ? styles.pressed : ""}`}
                  aria-label="Damian chat"
                  tabIndex={-1}
                  ref={chatButtonRef}
                >
                  <MessageCircle aria-hidden="true" />
                  <span className={styles.navRipple} aria-hidden="true" />
                </button>
                <button type="button" className={styles.navItem} aria-label="Activity" tabIndex={-1}>
                  <History aria-hidden="true" />
                </button>
                <button type="button" className={styles.navItem} aria-label="Settings" tabIndex={-1}>
                  <Settings aria-hidden="true" />
                </button>
              </nav>
            </aside>

            <div className={styles.dashboard}>
              <div className={styles.dashboardHeader}>
                <div>
                  <span className={styles.wordmark}>Coretta</span>
                  <span className={styles.testnetBadge}>Arc Testnet</span>
                </div>
                <span className={styles.dashboardLabel}>Overview</span>
              </div>

              <div className={styles.balanceCard}>
                <span>Available balance</span>
                <strong>2,480.32 <small>USDC</small></strong>
                <p>Smart wallet 0x9F3a…21c4</p>
              </div>

              <div className={styles.activityHeader}>
                <strong>Recent activity</strong>
                <span>View all</span>
              </div>
              <div className={styles.transactionList}>
                <Transaction name="Amara O." meta="Sent · 2 hours ago" amount="−45.00 USDC" />
                <Transaction name="0x71…09fB" meta="Received · Yesterday" amount="+120.00 USDC" incoming />
                <Transaction name="Julian K." meta="Sent · 2 days ago" amount="−18.50 USDC" />
              </div>
            </div>

            <div
              className={`${styles.headlineLayer} ${headlineVisible ? styles.visible : ""} ${headlineRetracting ? styles.retracting : ""}`}
              aria-hidden={!headlineVisible}
            >
              <div className={styles.headlineLockup}>
                <span>Damian</span>
                <h2>Chat with your remittance copilot</h2>
              </div>
            </div>

            <div className={`${styles.chatPanel} ${chatOpen ? styles.open : ""}`} aria-hidden={!chatOpen}>
              <div className={styles.chatHeader}>
                <div className={styles.damianAvatar}>D</div>
                <div className={styles.chatHeading}>
                  <strong>Damian</strong>
                  <span>{elapsed >= 9_000 ? "Your personal remittance copilot" : "Online"}</span>
                </div>
                <div className={styles.safetyLabel}>
                  <ShieldCheck aria-hidden="true" />
                  Confirm before sending
                </div>
              </div>

              <div className={styles.chatBody} aria-live="polite">
                {showUserMessage && (
                  <div className={`${styles.message} ${styles.userMessage}`}>
                    Send 1 USDC to 0x62e537…9cA4.
                    <time>10:41 AM</time>
                  </div>
                )}

                {showTyping && (
                  <div className={styles.typing} aria-label="Damian is typing">
                    <span />
                    <span />
                    <span />
                  </div>
                )}

                {showAssistantMessage && (
                  <div className={`${styles.message} ${styles.assistantMessage}`}>
                    I’ll prepare that transfer for your review.
                    <time>10:41 AM</time>
                  </div>
                )}

                {showTransferCard && (
                  <div className={styles.transferCard}>
                    <div className={styles.transferTitle}>
                      <div>
                        <span>Locked preview</span>
                        <strong>Transfer prepared</strong>
                      </div>
                      <ShieldCheck aria-hidden="true" />
                    </div>
                    <dl>
                      <TransferRow label="Amount" value="1 USDC" />
                      <TransferRow label="Recipient" value="0x62e537…9cA4" />
                      <TransferRow label="Network" value="Arc Testnet" />
                      <TransferRow label="Network fee" value="Paid in USDC" />
                    </dl>
                    <button
                      type="button"
                      className={`${styles.reviewButton} ${reviewPressed ? styles.reviewed : ""} ${cursorClicking && elapsed > 7_000 ? styles.pressed : ""}`}
                      tabIndex={-1}
                      ref={reviewButtonRef}
                    >
                      {reviewPressed ? <Check aria-hidden="true" /> : null}
                      {reviewPressed ? "Review complete" : "Review transfer"}
                    </button>
                    <p className={styles.transferNote}>Funds won’t move until you approve the wallet signature.</p>
                  </div>
                )}

                {showReadyMessage && (
                  <div className={`${styles.message} ${styles.assistantMessage}`}>
                    Your transfer is prepared. Approve the wallet signature when you’re ready.
                    <span className={`${styles.statusPill} ${readyForSignature ? styles.ready : ""}`}>
                      <span className={styles.statusDot} />
                      {readyForSignature ? "Ready for signature" : "Preparing signature"}
                    </span>
                  </div>
                )}
              </div>

              <div className={styles.chatComposer}>
                <div className={styles.composerField}>Ask Damian…</div>
                <button type="button" aria-label="Send message" tabIndex={-1}>
                  <ArrowRight aria-hidden="true" />
                </button>
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
            <span className={styles.timer}>{seconds.toFixed(1)}s / 10s</span>
          </div>
        </div>
      </section>

      <p className={styles.disclaimer}>Product demonstration only. No transaction is created or submitted.</p>
    </main>
  );
}

function Transaction({
  name,
  meta,
  amount,
  incoming = false,
}: {
  name: string;
  meta: string;
  amount: string;
  incoming?: boolean;
}) {
  return (
    <div className={styles.transactionRow}>
      <div>
        <strong>{name}</strong>
        <span>{meta}</span>
      </div>
      <span className={incoming ? styles.incoming : ""}>{amount}</span>
    </div>
  );
}

function TransferRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.transferRow}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
