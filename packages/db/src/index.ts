import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

/**
 * SQLite `file:` URLs are resolved relative to process.cwd(), which breaks in a
 * monorepo (API runs from apps/api or repo root). Pin relative sqlite paths to
 * packages/db/prisma so identity/session queries always open the same DB.
 */
function resolveDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return url;

  if (/^postgres(ql)?:/i.test(url)) {
    try {
      const parsed = new URL(url);
      // Prisma v6 otherwise opens `num_cpus * 2 + 1` connections. Keep the
      // persistent API inside Supabase Supavisor's session-pool allowance and
      // queue short request bursts instead of failing them with P1001/503.
      if (parsed.hostname.endsWith(".pooler.supabase.com")) {
        if (!parsed.searchParams.has("connection_limit")) {
          parsed.searchParams.set("connection_limit", "3");
        }
        if (!parsed.searchParams.has("pool_timeout")) {
          parsed.searchParams.set("pool_timeout", "30");
        }
        if (!parsed.searchParams.has("connect_timeout")) {
          parsed.searchParams.set("connect_timeout", "15");
        }
      }
      return parsed.toString();
    } catch {
      // Let Prisma report a malformed URL without leaking credentials here.
      return url;
    }
  }

  if (!url.startsWith("file:")) return url;

  const rawPath = url.slice("file:".length);
  // Already absolute (Unix /path or Windows C:\ / C:/)
  if (
    path.isAbsolute(rawPath) ||
    /^[a-zA-Z]:[\\/]/.test(rawPath) ||
    rawPath.startsWith("\\\\")
  ) {
    return url;
  }

  const schemaDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../prisma",
  );
  const absolute = path.resolve(schemaDir, rawPath);
  // Prisma on Windows prefers forward slashes in file URLs
  const normalized = absolute.replace(/\\/g, "/");
  return `file:${normalized}`;
}

const resolvedUrl = resolveDatabaseUrl();
if (resolvedUrl) {
  process.env.DATABASE_URL = resolvedUrl;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: resolvedUrl
      ? { db: { url: resolvedUrl } }
      : undefined,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
export type {
  User,
  Wallet,
  Transfer,
  Identity,
  Session,
  UserLimit,
  Prisma,
} from "@prisma/client";
