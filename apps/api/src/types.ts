import type { User, Wallet, Identity, UserLimit } from "@prisma/client";

export type AuthUser = User & {
  wallets: Wallet[];
  identities: Identity[];
  limits: UserLimit | null;
};

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}
