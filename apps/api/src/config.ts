import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load monorepo root .env first (API often starts with cwd = apps/api).
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../../.env") });
loadEnv(); // apps/api/.env or process cwd overrides

function requiredInProd(name: string, value: string | undefined, fallback: string): string {
  if (value && value.trim()) return value.trim();
  if (process.env.NODE_ENV === "production" || process.env.DEV_MODE === "false") {
    console.warn(`[config] Missing ${name} — using insecure fallback. Set it for production.`);
  }
  return fallback;
}

/**
 * Server configuration. Secrets must never be exposed to the client.
 * JWT_SECRET is accepted as an alias for SESSION_SECRET (prompt compatibility).
 * RPC_URL is accepted as an alias for ARC_TESTNET_RPC_URL.
 */
export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  sessionSecret: requiredInProd(
    "SESSION_SECRET|JWT_SECRET",
    process.env.SESSION_SECRET ?? process.env.JWT_SECRET,
    "dev-only-change-in-production",
  ),
  walletEncryptionKey: requiredInProd(
    "WALLET_ENCRYPTION_KEY",
    process.env.WALLET_ENCRYPTION_KEY,
    "dev-32-byte-key-change-me!!!!",
  ),
  aiMemoryKey:
    process.env.AI_MEMORY_KEY ??
    process.env.SESSION_SECRET ??
    process.env.JWT_SECRET ??
    "dev-ai-memory-key-change-me",
  devMode: process.env.DEV_MODE !== "false",
  /** Arc Testnet RPC — prefers ARC_TESTNET_RPC_URL, falls back to RPC_URL */
  arcRpcUrl:
    process.env.ARC_TESTNET_RPC_URL ??
    process.env.RPC_URL ??
    "https://rpc.testnet.arc.network",
  bundlerRpcUrl: process.env.BUNDLER_RPC_URL,
  circleApiKey: process.env.CIRCLE_API_KEY,
  circleEntitySecret: process.env.CIRCLE_ENTITY_SECRET,
  circleWalletSetId: process.env.CIRCLE_WALLET_SET_ID,
  kitKey: process.env.KIT_KEY,
  privyAppId: process.env.PRIVY_APP_ID,
  privyAppSecret: process.env.PRIVY_APP_SECRET,
  privyJwtVerificationKey: process.env.PRIVY_JWT_VERIFICATION_KEY,
  xaiApiKey: process.env.XAI_API_KEY,
  xaiModel: process.env.XAI_MODEL?.trim() || "grok-4.3",
  /**
   * CORS origins: comma-separated list, e.g.
   * https://coretta.app,https://www.coretta.app
   * Defaults to true (reflect request origin) in dev when unset.
   */
  corsOrigin: process.env.CORS_ORIGIN ?? process.env.CORS_ORIGINS,
};
