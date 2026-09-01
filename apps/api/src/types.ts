import type { User, Wallet, Identity, UserLimit } from "@coretta/db";

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
