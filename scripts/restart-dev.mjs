import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function killPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid)) pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
        console.log(`killed pid ${pid} (port ${port})`);
      } catch {
        /* already gone */
      }
    }
  } catch {
    console.log(`no listener on ${port}`);
  }
}

// Clear Next cache
const nextDir = path.join(root, "apps/landing/.next");
if (fs.existsSync(nextDir)) {
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.log("cleared apps/landing/.next");
}

// Clear session terminal logs for this worktree if present
const sessionsRoot = path.join(
  process.env.USERPROFILE || "",
  ".grok",
  "sessions",
);
if (fs.existsSync(sessionsRoot)) {
  for (const name of fs.readdirSync(sessionsRoot)) {
    if (!name.includes("2026-08-12-fde5197b") && !name.includes("arcremit")) continue;
    const term = path.join(sessionsRoot, name, "terminal");
    if (!fs.existsSync(term)) continue;
    let n = 0;
    for (const f of fs.readdirSync(term)) {
      if (!f.endsWith(".log")) continue;
      try {
        fs.unlinkSync(path.join(term, f));
        n++;
      } catch {
        /* skip locked */
      }
    }
    console.log(`cleared ${n} log files in ${term}`);
  }
}

killPort(3000);
killPort(3001);

console.log("starting landing + api...");
// Parent will start them separately via background tools
