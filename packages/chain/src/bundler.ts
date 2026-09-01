import {
  createBundlerClient,
  type SmartAccount,
} from "viem/account-abstraction";
import {
  createPublicClient,
  http,
  hexToBigInt,
  type Address,
  type PublicClient,
} from "viem";
import { ARC_TESTNET_CHAIN_ID } from "@coretta/shared";
import { arcTestnet, ARC_MIN_MAX_FEE_PER_GAS } from "./arc.js";
import { createCirclePaymaster } from "./paymaster.js";

export function getBundlerRpcUrl(chainId = ARC_TESTNET_CHAIN_ID): string {
  const override = process.env.BUNDLER_RPC_URL;
  if (override) return override;
  return `https://public.pimlico.io/v2/${chainId}/rpc`;
}

export function createArcPublicClient(
  rpcUrl?: string,
  transportOptions?: { timeout?: number; retryCount?: number },
): PublicClient {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(rpcUrl, transportOptions),
  });
}

export function createArcBundlerClient({
  account,
  client,
  rpcUrl: bundlerRpcUrl,
}: {
  account: SmartAccount;
  client: PublicClient;
  rpcUrl?: string;
}): ReturnType<typeof createBundlerClient> {
  const paymaster = createCirclePaymaster({ client, account });
  const resolvedBundlerUrl = bundlerRpcUrl ?? getBundlerRpcUrl();
  const bundlerTransport = http(resolvedBundlerUrl);

  return createBundlerClient({
    account,
    client,
    paymaster,
    userOperation: {
      estimateFeesPerGas: async () => {
        const res = await fetch(resolvedBundlerUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "pimlico_getUserOperationGasPrice",
            params: [],
          }),
        });
        const json = (await res.json()) as {
          result?: {
            standard: {
              maxFeePerGas: `0x${string}`;
              maxPriorityFeePerGas: `0x${string}`;
            };
          };
        };
        const fees = json.result?.standard;
        if (!fees) {
          return {
            maxFeePerGas: ARC_MIN_MAX_FEE_PER_GAS,
            maxPriorityFeePerGas: 1_000_000_000n,
          };
        }
        let maxFeePerGas = hexToBigInt(fees.maxFeePerGas);
        const maxPriorityFeePerGas = hexToBigInt(fees.maxPriorityFeePerGas);
        if (maxFeePerGas < ARC_MIN_MAX_FEE_PER_GAS) {
          maxFeePerGas = ARC_MIN_MAX_FEE_PER_GAS;
        }
        return { maxFeePerGas, maxPriorityFeePerGas };
      },
    },
    transport: bundlerTransport,
  });
}

export async function sendTokenTransferUserOp({
  account,
  client,
  recipient,
  amountMicro,
  tokenAddress,
}: {
  account: SmartAccount;
  client: PublicClient;
  recipient: Address;
  amountMicro: bigint;
  tokenAddress: Address;
}) {
  const bundlerClient = createArcBundlerClient({ account, client });
  const { erc20Abi } = await import("viem");
  const token = {
    address: tokenAddress,
    abi: erc20Abi,
  };

  const hash = await bundlerClient.sendUserOperation({
    account,
    calls: [
      {
        to: token.address,
        abi: token.abi,
        functionName: "transfer",
        args: [recipient, amountMicro],
      },
    ],
  });

  const receipt = await bundlerClient.waitForUserOperationReceipt({ hash });
  return {
    userOpHash: hash,
    transactionHash: receipt.receipt.transactionHash,
  };
}

export async function sendUsdcTransferUserOp(
  params: Omit<Parameters<typeof sendTokenTransferUserOp>[0], "tokenAddress">,
) {
  const { USDC_ADDRESS } = await import("@coretta/shared");
  return sendTokenTransferUserOp({
    ...params,
    tokenAddress: USDC_ADDRESS as Address,
  });
}
