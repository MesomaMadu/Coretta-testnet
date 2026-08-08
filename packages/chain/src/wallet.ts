import {
  createPublicClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import type { SmartAccount } from "viem/account-abstraction";
import { toSafeSmartAccount } from "permissionless/accounts";
import { arcTestnet } from "./arc.js";

/**
 * ERC-4337 Safe smart account (v0.7 EntryPoint).
 * Compatible with Circle Paymaster permit flow per Circle quickstart pattern.
 * Swap to toCircleSmartAccount when @circle-fin/modular-wallets-core is wired in production.
 */
export async function createSmartAccountFromOwnerKey(
  ownerPrivateKey: Hex,
  client?: PublicClient,
): Promise<{ account: SmartAccount; ownerAddress: Address }> {
  const publicClient =
    client ??
    createPublicClient({
      chain: arcTestnet,
      transport: http(),
    });
  const owner = privateKeyToAccount(ownerPrivateKey);
  const account = await toSafeSmartAccount({
    client: publicClient,
    owners: [owner],
    entryPoint: {
      address: entryPoint07Address,
      version: "0.7",
    },
    version: "1.4.1",
  });
  return { account, ownerAddress: owner.address };
}

export async function getUsdcBalanceMicro(
  client: PublicClient,
  address: Address,
): Promise<bigint> {
  const { USDC_ADDRESS } = await import("@coretta/shared");
  const { erc20Abi } = await import("viem");
  const balance = await client.readContract({
    address: USDC_ADDRESS as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
  return balance as bigint;
}
