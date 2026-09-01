import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  ARC_TESTNET_CHAIN_ID,
  MAX_BATCH_RECIPIENTS,
  buildTransactionAuthorizationMessage,
} from "../packages/shared/dist/index.js";
import { parseOwnershipMessage } from "../apps/api/dist/services/wallet-auth.js";
import { parseTransactionAuthorizationMessage } from "../apps/api/dist/services/transaction-auth.js";
import { normalizePrivyJwtVerificationKey } from "../apps/api/dist/lib/privy-verification.js";
import { isPrivyConnectivityError } from "../apps/api/dist/services/privy.js";
import { getVerifiedPrivyEmail } from "../apps/api/dist/services/privy.js";
import {
  circleScaBlockchainForCctpDestination,
  isCircleScaCctpDestination,
} from "../apps/api/dist/services/circle.js";

const address = "0x1111111111111111111111111111111111111111";
const issuedAt = "2026-08-19T00:00:00.000Z";

test("batch plans share one twenty-recipient limit", () => {
  assert.equal(MAX_BATCH_RECIPIENTS, 20);
});

test("Circle SCA self-bridges derive only onto native supported destination testnets", () => {
  assert.equal(circleScaBlockchainForCctpDestination("Base_Sepolia"), "BASE-SEPOLIA");
  assert.equal(circleScaBlockchainForCctpDestination("Arbitrum_Sepolia"), "ARB-SEPOLIA");
  assert.equal(circleScaBlockchainForCctpDestination("Polygon_Amoy_Testnet"), "MATIC-AMOY");
  assert.equal(isCircleScaCctpDestination("Unichain_Sepolia"), true);
  assert.equal(isCircleScaCctpDestination("Codex_Testnet"), false);
  assert.equal(isCircleScaCctpDestination("Injective_Testnet"), false);
  assert.equal(isCircleScaCctpDestination("Morph_Testnet"), false);
  assert.equal(isCircleScaCctpDestination("Pharos_Testnet"), false);
  assert.equal(circleScaBlockchainForCctpDestination("Edge_Testnet"), null);
});

test("Privy verification keys reject malformed overrides and normalize escaped PEM", () => {
  assert.equal(normalizePrivyJwtVerificationKey("not-a-public-key"), undefined);

  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString().trim();
  assert.equal(
    normalizePrivyJwtVerificationKey(pem.replace(/\n/g, "\\n")),
    pem,
  );
});

test("Privy connectivity failures remain distinct from invalid sessions", () => {
  assert.equal(isPrivyConnectivityError(new Error("Connection error.")), true);
  assert.equal(isPrivyConnectivityError(new Error("request timed out")), true);
  assert.equal(isPrivyConnectivityError(new Error("invalid auth token")), false);
});

test("Privy accepts verified email OTP and Google identities but rejects unverified claims", () => {
  assert.equal(getVerifiedPrivyEmail([{ type: "email", address: "User@Example.com", verified_at: 1 }]), "user@example.com");
  assert.equal(getVerifiedPrivyEmail([{ type: "google_oauth", email: "Google@Example.com", subject: "google-1", verified_at: 1 }]), "google@example.com");
  assert.throws(() => getVerifiedPrivyEmail([{ type: "google_oauth", email: "fake@example.com", subject: "google-2", verified_at: 0 }]), /PRIVY_EMAIL_REQUIRED/);
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

test("transaction authorization preserves one compound swap-and-send plan", () => {
  const intent = {
    action: "swap_and_send",
    tokenIn: "USDC",
    tokenOut: "EURC",
    amountIn: "100",
    requests: [
      {
        recipient: { type: "email", value: "recipient@example.com" },
        amount: "40",
        asset: "EURC",
        idempotencyKey: "00000000-0000-4000-8000-000000000002",
      },
    ],
    nonce: "00000000-0000-4000-8000-000000000003",
  };
  const message = buildTransactionAuthorizationMessage({
    address,
    chainId: ARC_TESTNET_CHAIN_ID,
    issuedAt,
    intent,
  });
  const parsed = parseTransactionAuthorizationMessage(message);
  assert.ok(parsed);
  assert.deepEqual(parsed.intent, intent);
});

test("transaction authorization preserves one compound swap-and-bridge plan", () => {
  const intent = {
    action: "swap_and_bridge",
    tokenIn: "EURC",
    tokenOut: "USDC",
    amountIn: "2",
    sourceChain: "Arc_Testnet",
    destinationChain: "Base_Sepolia",
    recipientAddress: "0x2222222222222222222222222222222222222222",
    bridgeAmount: "1.99",
    idempotencyKey: "00000000-0000-4000-8000-000000000006",
    swapNonce: "00000000-0000-4000-8000-000000000007",
    bridgeNonce: "00000000-0000-4000-8000-000000000008",
  };
  const message = buildTransactionAuthorizationMessage({
    address,
    chainId: ARC_TESTNET_CHAIN_ID,
    issuedAt,
    intent,
  });
  const parsed = parseTransactionAuthorizationMessage(message);
  assert.ok(parsed);
  assert.deepEqual(parsed.intent, intent);
});

test("transaction authorization preserves every CCTP batch recipient, amount, and network", () => {
  const intent = {
    action: "bridge_batch",
    sourceChain: "Arc_Testnet",
    destinationChain: "Base_Sepolia",
    recipients: [
      {
        recipientAddress: "0x2222222222222222222222222222222222222222",
        amount: "1.25",
        destinationChain: "Base_Sepolia",
      },
      {
        recipientAddress: "0x3333333333333333333333333333333333333333",
        amount: "2.75",
        destinationChain: "Ethereum_Sepolia",
      },
    ],
    idempotencyKey: "00000000-0000-4000-8000-000000000004",
    nonce: "00000000-0000-4000-8000-000000000005",
  };
  const message = buildTransactionAuthorizationMessage({
    address,
    chainId: ARC_TESTNET_CHAIN_ID,
    issuedAt,
    intent,
  });
  const parsed = parseTransactionAuthorizationMessage(message);
  assert.ok(parsed);
  assert.deepEqual(parsed.intent, intent);
});

test("transaction authorization preserves the exact recoverable CCTP batch legs", () => {
  const intent = {
    action: "bridge_batch_retry",
    batchId: "batch_12345678",
    operationIds: ["operation_11111111", "operation_22222222"],
    nonce: "00000000-0000-4000-8000-000000000006",
  };
  const message = buildTransactionAuthorizationMessage({
    address,
    chainId: ARC_TESTNET_CHAIN_ID,
    issuedAt,
    intent,
  });
  const parsed = parseTransactionAuthorizationMessage(message);
  assert.ok(parsed);
  assert.deepEqual(parsed.intent, intent);
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
