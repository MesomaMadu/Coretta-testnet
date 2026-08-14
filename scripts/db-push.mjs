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

function kind(url) {
  if (!url) return "missing";
  if (/db\.[a-z0-9-]+\.supabase\.co/i.test(url)) return "supabase_direct";
  if (/pooler\.supabase\.com/i.test(url) && /:6543/.test(url))
    return "supabase_transaction_pooler";
  if (/pooler\.supabase\.com/i.test(url)) return "supabase_session_pooler";
  return "other";
}

console.log("DATABASE_URL kind:", kind(env.DATABASE_URL));
console.log("DIRECT_URL kind:", kind(env.DIRECT_URL));

if (!env.DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}
if (!env.DIRECT_URL) {
  console.error("DIRECT_URL missing (required by schema.prisma directUrl)");
  process.exit(1);
}

const steps = [
  ["generate", ["prisma", "generate", "--schema", "packages/db/prisma/schema.prisma"]],
  ["db push", ["prisma", "db", "push", "--schema", "packages/db/prisma/schema.prisma"]],
];

for (const [name, args] of steps) {
  console.log(`\n>>> ${name}`);
  const r = spawnSync("npx", args, { env, stdio: "inherit", shell: true });
  if (r.status !== 0) {
    console.error(`FAILED: ${name}`);
    process.exit(r.status ?? 1);
  }
}

console.log("\n>>> build @coretta/db");
const b = spawnSync("npm.cmd", ["run", "build", "-w", "@coretta/db"], {
  env,
  stdio: "inherit",
  shell: true,
});
if (b.status !== 0) process.exit(b.status ?? 1);

console.log("\nOK: prisma generate + db push + db package build");
