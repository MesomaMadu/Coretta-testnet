/**
 * Reproduce the exact DB operations wallet auth runs after signature verify,
 * without needing a real wallet signature.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Match API config load order: root .env then local
function loadEnvFile(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
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
    // dotenv does not override existing by default
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

const here = path.join(root, "apps/api/src");
loadEnvFile(path.resolve(here, "../../../.env"));
loadEnvFile(path.resolve(root, "apps/api/.env"));

console.log("DATABASE_URL set:", Boolean(process.env.DATABASE_URL));
console.log(
  "DATABASE_URL host:",
  (process.env.DATABASE_URL || "").replace(/:[^:@/]+@/, ":****@").replace(/^[^@]+@/, "***@"),
);

const { prisma } = await import(
  pathToFileURL(path.join(root, "packages/db/dist/index.js")).href
);

const testAddr = `0x${randomUUID().replace(/-/g, "").slice(0, 40)}`;

try {
  console.log("step1: identity.findUnique");
  const existing = await prisma.identity.findUnique({
    where: {
      type_normalizedValue: { type: "wallet", normalizedValue: testAddr },
    },
  });
  console.log("  existing:", existing);

  console.log("step2: user.create with identity+wallet+limits (auth provision shape)");
  const user = await prisma.user.create({
    data: {
      identities: {
        create: {
          type: "wallet",
          normalizedValue: testAddr,
          verifiedAt: new Date(),
        },
      },
      wallets: {
        create: {
          scaAddress: `0x${randomUUID().replace(/-/g, "").slice(0, 40)}`,
          ownerAddress: testAddr,
          vendorWalletId: randomUUID(),
          ownerKeyRef: null,
          counterfactual: false,
          vendor: "circle_modular",
        },
      },
      limits: { create: {} },
    },
    include: { wallets: true, limits: true, identities: true },
  });
  console.log("  user id:", user.id);

  console.log("step3: session.create");
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  console.log("  session id:", session.id);

  console.log("step4: walletUsageRecord (connectionCount path)");
  await prisma.walletUsageRecord.upsert({
    where: { walletAddress: testAddr },
    create: {
      walletAddress: testAddr,
      userId: user.id,
      connectionCount: 1,
      signatureRequestCount: 1,
    },
    update: {
      connectionCount: { increment: 1 },
      signatureRequestCount: { increment: 1 },
      userId: user.id,
    },
  });
  console.log("  usage ok");

  console.log("step5: walletInteraction");
  await prisma.walletInteraction.create({
    data: {
      userId: user.id,
      walletAddress: testAddr,
      kind: "session",
      label: "test",
      status: "complete",
    },
  });
  console.log("  interaction ok");

  // cleanup
  await prisma.session.delete({ where: { id: session.id } });
  await prisma.walletInteraction.deleteMany({ where: { userId: user.id } });
  await prisma.walletUsageRecord.delete({ where: { walletAddress: testAddr } }).catch(() => {});
  await prisma.wallet.deleteMany({ where: { userId: user.id } });
  await prisma.userLimit.deleteMany({ where: { userId: user.id } });
  await prisma.identity.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  console.log("cleanup ok");
  console.log("ALL_AUTH_DB_STEPS_OK");
} catch (e) {
  console.error("FAILED_AT_ERROR");
  console.error("name:", e?.name);
  console.error("code:", e?.code);
  console.error("message:", e?.message);
  const msg = e instanceof Error ? e.message : String(e);
  const matched =
    /Unable to open the database file|P1001|P1017|P1003|prisma\./i.test(msg);
  console.error("matches_DATABASE_UNAVAILABLE_regex:", matched);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
