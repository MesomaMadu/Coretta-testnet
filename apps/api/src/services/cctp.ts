import { createRequire } from "node:module";
import type * as CircleAppKit from "@circle-fin/app-kit";
import type * as CircleWalletsAdapter from "@circle-fin/adapter-circle-wallets";
import type * as CircleCctpProvider from "@circle-fin/provider-cctp-v2";
import {
  createPublicClient,
  formatUnits,
  http,
  type Address,
} from "viem";
import {
  CCTP_EVM_TESTNET_DESTINATIONS,
  CCTP_RECOVERY_ATTEMPT_LIMIT,
  CCTP_SOURCE_CHAIN,
  formatMicroToUsdc,
  parseUsdcToMicro,
  type CctpEvmTestnetChainId,
} from "@coretta/shared";
import { config } from "../config.js";
import { log } from "../lib/log.js";

const circleRequire = createRequire(import.meta.url);

type RuntimeEvmChain = CircleAppKit.EVMChainDefinition & {
  title?: string;
  cctp?: {
    domain: number;
    forwarderSupported?: { source?: boolean; destination?: boolean };
    contracts?: {
      v2?: {
        tokenMessenger?: string;
        tokenMessengerWithFees?: string;
        messageTransmitter?: string;
      };
    };
  };
};

type CctpProviderBridgeParams = Parameters<
  InstanceType<typeof CircleCctpProvider.CCTPV2BridgingProvider>["bridge"]
>[0];

let sdk:
  | {
      AppKit: typeof CircleAppKit.AppKit;
      createCircleWalletsAdapter: typeof CircleWalletsAdapter.createCircleWalletsAdapter;
      CCTPV2BridgingProvider: typeof CircleCctpProvider.CCTPV2BridgingProvider;
    }
  | undefined;
let supportedBridgeChains: RuntimeEvmChain[] | undefined;

const BALANCE_CACHE_MS = 60_000;
const balanceCache = new Map<
  string,
  {
    expiresAt: number;
    value: Awaited<ReturnType<typeof queryCctpWalletBalances>>;
  }
>();
const balanceLoads = new Map<
  string,
  Promise<Awaited<ReturnType<typeof queryCctpWalletBalances>>>
>();

const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

function getSdk() {
  if (!sdk) {
    const appKit = circleRequire("@circle-fin/app-kit") as typeof CircleAppKit;
    const adapter = circleRequire(
      "@circle-fin/adapter-circle-wallets",
    ) as typeof CircleWalletsAdapter;
    const cctpProvider = circleRequire(
      "@circle-fin/provider-cctp-v2",
    ) as typeof CircleCctpProvider;
    sdk = {
      AppKit: appKit.AppKit,
      createCircleWalletsAdapter: adapter.createCircleWalletsAdapter,
      CCTPV2BridgingProvider: cctpProvider.CCTPV2BridgingProvider,
    };
  }
  return sdk;
}

function createCctpProvider() {
  const { CCTPV2BridgingProvider } = getSdk();
  return new CCTPV2BridgingProvider({
    attestation: {
      maxRetries: CCTP_RECOVERY_ATTEMPT_LIMIT,
    },
  });
}

function appKitChains() {
  if (supportedBridgeChains) return supportedBridgeChains;
  const { AppKit } = getSdk();
  supportedBridgeChains = new AppKit().getSupportedChains(
    "bridge",
  ) as unknown as RuntimeEvmChain[];
  return supportedBridgeChains;
}

export function getCctpChainDefinition(chain: string) {
  const found = appKitChains().find(
    (candidate) =>
      candidate.type === "evm" &&
      candidate.chain === chain &&
      candidate.isTestnet &&
      candidate.cctp?.contracts?.v2,
  );
  if (!found) throw new Error("CCTP_CHAIN_UNAVAILABLE");
  return found;
}

export function listCctpEvmTestnetDestinations() {
  return CCTP_EVM_TESTNET_DESTINATIONS.flatMap((configured) => {
    const chain = appKitChains().find(
      (candidate) =>
        candidate.type === "evm" &&
        candidate.chain === configured.id &&
        candidate.isTestnet &&
        candidate.cctp?.contracts?.v2 &&
        candidate.cctp.forwarderSupported?.destination === true,
    );
    if (!chain) return [];
    return [
      {
        id: configured.id,
        label: configured.label,
        chainId: chain.chainId,
        domain: chain.cctp!.domain,
        explorerUrl: chain.explorerUrl,
        usdcAddress: chain.usdcAddress,
      },
    ];
  });
}

function listCctpBalanceChains() {
  const source = getCctpChainDefinition(CCTP_SOURCE_CHAIN);
  const destinations = listCctpEvmTestnetDestinations().map((destination) =>
    getCctpChainDefinition(destination.id),
  );
  return [source, ...destinations].filter(
    (chain, index, all) => all.findIndex((candidate) => candidate.chain === chain.chain) === index,
  );
}

async function queryCctpWalletBalances(walletAddress: string) {
  const chains = listCctpBalanceChains();
  const balances: Array<{
    id: string;
    label: string;
    chainId: number;
    explorerUrl: string;
    balance: string | null;
    status: "ready" | "unavailable";
  }> = [];
  let totalMicro = 0n;
  const failedChains: string[] = [];
  const results = await Promise.all(
    chains.map(async (chain) => {
        const rpcUrl = chain.rpcEndpoints[0];
        if (!rpcUrl || !chain.usdcAddress) {
          return {
            id: chain.chain,
            label: chain.name,
            chainId: chain.chainId,
            explorerUrl: chain.explorerUrl,
            balance: null,
            balanceMicro: 0n,
            status: "unavailable" as const,
          };
        }
        try {
          const client = createPublicClient({
            transport: http(rpcUrl, { timeout: 3_000, retryCount: 0 }),
          });
          const raw = await client.readContract({
            address: chain.usdcAddress as Address,
            abi: ERC20_BALANCE_ABI,
            functionName: "balanceOf",
            args: [walletAddress as Address],
          });
          return {
            id: chain.chain,
            label: chain.name,
            chainId: chain.chainId,
            explorerUrl: chain.explorerUrl,
            balance: formatUnits(raw, 6),
            balanceMicro: raw,
            status: "ready" as const,
          };
        } catch (error) {
          failedChains.push(chain.chain);
          return {
            id: chain.chain,
            label: chain.name,
            chainId: chain.chainId,
            explorerUrl: chain.explorerUrl,
            balance: null,
            balanceMicro: 0n,
            status: "unavailable" as const,
          };
        }
    }),
  );
  for (const result of results) {
    totalMicro += result.balanceMicro;
    balances.push({
      id: result.id,
      label: result.label,
      chainId: result.chainId,
      explorerUrl: result.explorerUrl,
      balance: result.balance,
      status: result.status,
    });
  }
  if (failedChains.length) {
    log.warn("cctp", "Some cross-chain balances are temporarily unavailable", {
      count: failedChains.length,
      chains: failedChains,
    });
  }

  return {
    walletAddress: walletAddress.toLowerCase(),
    token: "USDC" as const,
    totalBalance: formatMicroToUsdc(totalMicro),
    availableChainCount: balances.filter((balance) => balance.status === "ready").length,
    unavailableChainCount: balances.filter((balance) => balance.status === "unavailable").length,
    chains: balances,
    updatedAt: new Date().toISOString(),
  };
}

export async function getCctpWalletBalances(walletAddress: string) {
  const cacheKey = walletAddress.toLowerCase();
  const cached = balanceCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const activeLoad = balanceLoads.get(cacheKey);
  if (activeLoad) return activeLoad;
  const load = Promise.resolve()
    .then(() => queryCctpWalletBalances(walletAddress))
    .then((value) => {
      balanceCache.set(cacheKey, {
        expiresAt: Date.now() + BALANCE_CACHE_MS,
        value,
      });
      return value;
    })
    .finally(() => {
      balanceLoads.delete(cacheKey);
    });
  balanceLoads.set(cacheKey, load);
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      load,
      new Promise<Awaited<ReturnType<typeof queryCctpWalletBalances>>>((resolve) => {
        timer = setTimeout(() => {
          const chains = listCctpBalanceChains().map((chain) => ({
            id: chain.chain,
            label: chain.name,
            chainId: chain.chainId,
            explorerUrl: chain.explorerUrl,
            balance: null,
            status: "unavailable" as const,
          }));
          resolve({
            walletAddress: cacheKey,
            token: "USDC" as const,
            totalBalance: "0",
            availableChainCount: 0,
            unavailableChainCount: chains.length,
            chains,
            updatedAt: new Date().toISOString(),
          });
        }, 3_500);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function validateBridgeConfiguration() {
  if (!config.circleApiKey || !config.circleEntitySecret) {
    throw new Error("CIRCLE_CONFIG_MISSING");
  }
}

function createAdapter() {
  validateBridgeConfiguration();
  const { createCircleWalletsAdapter } = getSdk();
  return createCircleWalletsAdapter({
    apiKey: config.circleApiKey!,
    entitySecret: config.circleEntitySecret!,
  });
}

function bridgeParams(input: {
  walletAddress: string;
  destinationChain: CctpEvmTestnetChainId;
  recipientAddress: string;
  amount: string;
}) {
  const supported = listCctpEvmTestnetDestinations().some(
    (chain) => chain.id === input.destinationChain,
  );
  if (!supported) throw new Error("CCTP_ROUTE_UNAVAILABLE");
  return {
    from: {
      adapter: createAdapter(),
      chain: CCTP_SOURCE_CHAIN,
      address: input.walletAddress,
    },
    to: {
      chain: input.destinationChain,
      recipientAddress: input.recipientAddress,
      useForwarder: true as const,
    },
    amount: input.amount,
    token: "USDC" as const,
    config: { transferSpeed: "FAST" as const },
  };
}

function cctpProviderParams(input: {
  walletAddress: string;
  destinationChain: CctpEvmTestnetChainId;
  recipientAddress: string;
  amount: string;
}): CctpProviderBridgeParams {
  const supported = listCctpEvmTestnetDestinations().some(
    (chain) => chain.id === input.destinationChain,
  );
  if (!supported) throw new Error("CCTP_ROUTE_UNAVAILABLE");
  return {
    source: {
      adapter: createAdapter(),
      chain: getCctpChainDefinition(CCTP_SOURCE_CHAIN),
      address: input.walletAddress,
    },
    destination: {
      chain: getCctpChainDefinition(input.destinationChain),
      recipientAddress: input.recipientAddress,
      useForwarder: true as const,
    },
    amount: parseUsdcToMicro(input.amount).toString(),
    token: "USDC" as const,
    config: { transferSpeed: "FAST" as const },
  } as unknown as CctpProviderBridgeParams;
}

export async function estimateCctpBridge(input: {
  walletAddress: string;
  destinationChain: CctpEvmTestnetChainId;
  recipientAddress: string;
  amount: string;
}) {
  const { AppKit } = getSdk();
  const estimate = await new AppKit().estimateBridge(bridgeParams(input));
  const feeTotal = estimate.fees.reduce((total, fee) => {
    const parsed = fee.amount === null ? NaN : Number(fee.amount);
    return Number.isFinite(parsed) ? total + parsed : total;
  }, 0);
  return {
    amount: estimate.amount,
    feeTotal: feeTotal.toFixed(6).replace(/\.?0+$/, "") || "0",
    fees: estimate.fees.map((fee) => ({
      type: fee.type,
      token: fee.token,
      amount: fee.amount,
    })),
    quotedAt: new Date().toISOString(),
  };
}

export async function estimateCctpBridgeBatch(input: {
  walletAddress: string;
  recipients: Array<{
    recipientAddress: string;
    amount: string;
    destinationChain: CctpEvmTestnetChainId;
  }>;
}) {
  const estimates: Awaited<ReturnType<typeof estimateCctpBridge>>[] = [];
  for (let index = 0; index < input.recipients.length; index += 4) {
    const chunk = input.recipients.slice(index, index + 4);
    estimates.push(
      ...(await Promise.all(
        chunk.map((recipient) =>
          estimateCctpBridge({
            walletAddress: input.walletAddress,
            destinationChain: recipient.destinationChain,
            recipientAddress: recipient.recipientAddress,
            amount: recipient.amount,
          }),
        ),
      )),
    );
  }
  const feeTotalMicro = estimates.reduce(
    (total, estimate) => total + parseUsdcToMicro(estimate.feeTotal),
    0n,
  );
  return {
    feeTotal: formatMicroToUsdc(feeTotalMicro),
    quotedAt: new Date().toISOString(),
    legs: estimates.map((estimate, index) => ({
      recipientAddress: input.recipients[index].recipientAddress,
      amount: input.recipients[index].amount,
      destinationChain: input.recipients[index].destinationChain,
      feeTotal: estimate.feeTotal,
      fees: estimate.fees,
    })),
  };
}

export async function executeCctpBridge(input: {
  walletAddress: string;
  destinationChain: CctpEvmTestnetChainId;
  recipientAddress: string;
  amount: string;
}): Promise<CircleAppKit.BridgeResult> {
  log.info("cctp", "Executing Arc Testnet CCTP bridge", {
    destinationChain: input.destinationChain,
    amount: input.amount,
    recipient: `${input.recipientAddress.slice(0, 6)}…${input.recipientAddress.slice(-4)}`,
  });
  const result = await createCctpProvider().bridge(cctpProviderParams(input));
  return Object.assign(result, { corettaAmountFormat: "micro" as const }) as unknown as CircleAppKit.BridgeResult;
}

export async function retryCctpBridge(
  result: CircleAppKit.BridgeResult,
): Promise<CircleAppKit.BridgeResult> {
  const providerResult = result as CircleAppKit.BridgeResult & {
    corettaAmountFormat?: "micro";
  };
  if (providerResult.corettaAmountFormat !== "micro") {
    providerResult.amount = parseUsdcToMicro(providerResult.amount).toString();
    providerResult.corettaAmountFormat = "micro";
  }
  return createCctpProvider().retry(
    providerResult as never,
    { from: createAdapter() },
  ) as unknown as Promise<CircleAppKit.BridgeResult>;
}

export function serializeBridgeResult(result: CircleAppKit.BridgeResult) {
  return JSON.stringify(result, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}

export function parseBridgeResult(value: string) {
  return JSON.parse(value) as CircleAppKit.BridgeResult;
}

export function summarizeBridgeResult(result: CircleAppKit.BridgeResult) {
  const steps = result.steps.map((step) => ({
    name: step.name,
    state: step.state,
    txHash: "txHash" in step ? step.txHash : undefined,
    explorerUrl: "explorerUrl" in step ? step.explorerUrl : undefined,
    error:
      "errorMessage" in step && typeof step.errorMessage === "string"
        ? step.errorMessage
        : "error" in step && step.error
          ? step.error instanceof Error
            ? step.error.message
            : String(step.error)
          : undefined,
  }));
  const failed = steps.find((step) => step.state === "error");
  const burn = steps.find((step) => step.name === "burn");
  const mint = steps.find((step) => step.name === "mint");
  return {
    state: result.state,
    steps,
    sourceTxHash: burn?.txHash,
    destinationTxHash: mint?.txHash,
    explorerUrl: mint?.explorerUrl ?? burn?.explorerUrl,
    failureReason: failed?.error,
    recoverable: result.state === "error",
  };
}
