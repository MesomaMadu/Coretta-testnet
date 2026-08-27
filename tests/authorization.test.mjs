import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  ARC_TESTNET_CHAIN_ID,
  buildTransactionAuthorizationMessage,
} from "../packages/shared/dist/index.js";
import { parseOwnershipMessage } from "../apps/api/dist/services/wallet-auth.js";
import { parseTransactionAuthorizationMessage } from "../apps/api/dist/services/transaction-auth.js";
import { normalizePrivyJwtVerificationKey } from "../apps/api/dist/lib/privy-verification.js";

const address = "0x1111111111111111111111111111111111111111";
const issuedAt = "2026-08-19T00:00:00.000Z";

test("Privy verification keys reject malformed overrides and normalize escaped PEM", () => {
  assert.equal(normalizePrivyJwtVerificationKey("not-a-public-key"), undefined);

  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString().trim();
  assert.equal(
    normalizePrivyJwtVerificationKey(pem.replace(/\n/g, "\\n")),
    pem,
  );
});

test("transaction authorization preserves the exact remit intent", () => {
  const intent = {
    action: "remit",
    requests: [
      {
        recipient: { type: "email", value: "recipient@example.com" },
        amount: "12.50",
        asset: "EURC",
        idempotencyKey: "00000000-0000-4000-8000-000000000001",
      },
    ],
  };
  const message = buildTransactionAuthorizationMessage({
    address,
    chainId: ARC_TESTNET_CHAIN_ID,
    issuedAt,
    intent,
  });
  const parsed = parseTransactionAuthorizationMessage(message);

  assert.ok(parsed);
  assert.equal(parsed.address, address);
  assert.equal(parsed.chainId, ARC_TESTNET_CHAIN_ID);
  assert.equal(parsed.issuedAt.toISOString(), issuedAt);
  assert.deepEqual(parsed.intent, intent);
});

test("transaction authorization rejects unrelated text", () => {
  assert.equal(parseTransactionAuthorizationMessage("approve everything"), null);
});

test("wallet ownership parser captures address, Arc chain, and issue time", () => {
  const message = `Sign this message to verify ownership of your wallet and activate your Coretta session.

Address: ${address}
Chain ID: ${ARC_TESTNET_CHAIN_ID}
Issued At: ${issuedAt}

This request will not trigger a blockchain transaction or cost any gas fees.`;
  const parsed = parseOwnershipMessage(message);

  assert.ok(parsed);
  assert.equal(parsed.address, address);
  assert.equal(parsed.chainId, ARC_TESTNET_CHAIN_ID);
  assert.equal(parsed.issuedAt.toISOString(), issuedAt);
});
