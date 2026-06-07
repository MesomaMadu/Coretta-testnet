/**
 * Smoke-check Arc Testnet + bundler connectivity.
 * Run: npm run verify -w @arcremit/chain
 */
import { erc20Abi } from "viem";
import { ARC_TESTNET_CHAIN_ID, USDC_ADDRESS } from "@arcremit/shared";
import { createArcPublicClient, getBundlerRpcUrl } from "./bundler.js";

async function main() {
  const client = createArcPublicClient();
  const chainId = await client.getChainId();
  const block = await client.getBlockNumber();
  const decimals = await client.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "decimals",
  });

  console.log("Arc RPC OK");
  console.log("  chainId:", chainId, chainId === ARC_TESTNET_CHAIN_ID ? "✓" : "✗");
  console.log("  block:", block.toString());
  console.log("  USDC decimals:", decimals);

  const bundlerUrl = getBundlerRpcUrl();
  const res = await fetch(bundlerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_supportedEntryPoints",
      params: [],
    }),
  });
  const json = (await res.json()) as { result?: string[]; error?: { message: string } };
  if (json.error) {
    console.warn("Bundler check failed:", json.error.message);
    console.warn("  URL:", bundlerUrl);
    console.warn("  Verify Pimlico supports chain", ARC_TESTNET_CHAIN_ID);
    process.exit(1);
  }
  console.log("Bundler OK");
  console.log("  entryPoints:", json.result?.length ?? 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
