import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl:
    process.env.DATABASE_URL ?? "file:../../packages/db/prisma/dev.db",
  sessionSecret:
    process.env.SESSION_SECRET ?? "dev-only-change-in-production",
  /** Dev: encrypt/store owner keys — production: Circle Wallets API only */
  walletEncryptionKey:
    process.env.WALLET_ENCRYPTION_KEY ?? "dev-32-byte-key-change-me!!!!",
  /** Encrypt AI conversations & memory summaries at rest */
  aiMemoryKey: process.env.AI_MEMORY_KEY ?? process.env.SESSION_SECRET ?? "dev-ai-memory-key-change-me",
  devMode: process.env.DEV_MODE !== "false",
};
