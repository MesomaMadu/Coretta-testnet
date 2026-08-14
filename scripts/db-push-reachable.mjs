import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(".env");
const env = { ...process.env };

for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  if (!line.trim() || line.trim().startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i < 0) continue;
  const k = line.slice(0, i).trim();
  let v = line.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  env[k] = v;
}

/**
 * Direct host is ENOTFOUND from this network.
 * Session pooler :5432 is reachable — use it as Prisma directUrl for push only.
 * Transaction pooler :6543 stays as DATABASE_URL for app runtime.
 */
function toSessionPooler(url) {
  if (!url) return url;
  return url
    .replace(/:6543\b/, ":5432")
    .replace(/\?pgbouncer=true&?/, "?")
    .replace(/&pgbouncer=true/, "")
    .replace(/\?$/, "");
}

const migrateUrl = toSessionPooler(env.DATABASE_URL);
if (!migrateUrl || !/pooler\.supabase\.com/.test(migrateUrl)) {
  console.error("Could not derive session pooler URL from DATABASE_URL");
  process.exit(1);
}

// Prisma uses directUrl for migrate/db push when set
env.DIRECT_URL = migrateUrl;

console.log("Push strategy:");
console.log("  DATABASE_URL: transaction pooler (app)");
console.log("  DIRECT_URL (override for this push): session pooler :5432");
console.log("  reason: db.<ref>.supabase.co is ENOTFOUND on this network");

console.log("\n>>> prisma db push");
const r = spawnSync(
  "npx",
  [
    "prisma",
    "db",
    "push",
    "--schema",
    "packages/db/prisma/schema.prisma",
    "--accept-data-loss",
  ],
  { env, stdio: "inherit", shell: true },
);
if (r.status !== 0) process.exit(r.status ?? 1);

console.log("\n>>> build @coretta/db");
const b = spawnSync("npm.cmd", ["run", "build", "-w", "@coretta/db"], {
  env,
  stdio: "inherit",
  shell: true,
});
if (b.status !== 0) process.exit(b.status ?? 1);

console.log("\nOK: schema pushed via session pooler; db package built");
