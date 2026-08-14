import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
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

function kind(url) {
  if (!url) return "missing";
  if (/db\.[a-z0-9-]+\.supabase\.co/i.test(url)) return "supabase_direct";
  if (/pooler\.supabase\.com/i.test(url) && /:6543/.test(url))
    return "tx_pooler";
  if (/pooler\.supabase\.com/i.test(url)) return "session_pooler";
  return "other";
}

console.log("DATABASE_URL kind:", kind(env.DATABASE_URL));
console.log("DIRECT_URL kind:", kind(env.DIRECT_URL));

// Import prisma the same way the API does (compiled dist)
process.env.DATABASE_URL = env.DATABASE_URL;
process.env.DIRECT_URL = env.DIRECT_URL;

const { prisma } = await import(
  pathToFileURL(path.join(root, "packages/db/dist/index.js")).href
);

try {
  const n = await prisma.identity.count();
  console.log("identity.count OK:", n);
  await prisma.$queryRaw`SELECT 1 as ok`;
  console.log("raw SELECT 1 OK");
} catch (e) {
  console.error("PRISMA_ERROR_NAME:", e?.name);
  console.error("PRISMA_ERROR_CODE:", e?.code);
  console.error("PRISMA_ERROR_MESSAGE:", e?.message?.slice(0, 500));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
