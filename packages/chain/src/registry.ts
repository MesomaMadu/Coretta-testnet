import type { NetworkMetadata, RouteEstimate } from "@coretta/shared";

export const SUPPORTED_NETWORKS: Record<string, NetworkMetadata> = {
  arc_testnet: {
    id: "arc_testnet",
    name: "Arc Testnet",
    chainId: 5042002,
    isArc: true,
    supported: true,
    rpcUrl: process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network",
    explorerUrl: "https://testnet.arcscan.app",
    hasDeterministicFinality: true,
    hasSponsorship: true,
  },
  ethereum_sepolia: {
    id: "ethereum_sepolia",
    name: "Ethereum Sepolia",
    chainId: 11155111,
    isArc: false,
    supported: false,
    rpcUrl: "https://rpc.sepolia.org",
    explorerUrl: "https://sepolia.etherscan.io",
    hasDeterministicFinality: false,
    hasSponsorship: false,
  },
  base_sepolia: {
    id: "base_sepolia",
    name: "Base Sepolia",
    chainId: 84532,
    isArc: false,
    supported: false,
    rpcUrl: "https://sepolia.base.org",
    explorerUrl: "https://sepolia.basescan.org",
    hasDeterministicFinality: false,
    hasSponsorship: false,
  },
  arbitrum_sepolia: {
    id: "arbitrum_sepolia",
    name: "Arbitrum Sepolia",
    chainId: 421614,
    isArc: false,
    supported: false,
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
    explorerUrl: "https://sepolia.arbiscan.io",
    hasDeterministicFinality: false,
    hasSponsorship: false,
  },
  optimism_sepolia: {
    id: "optimism_sepolia",
    name: "Optimism Sepolia",
    chainId: 11155420,
    isArc: false,
    supported: false,
    rpcUrl: "https://sepolia.optimism.io",
    explorerUrl: "https://sepolia-optimism.etherscan.io",
    hasDeterministicFinality: false,
    hasSponsorship: false,
  },
  polygon_amoy: {
    id: "polygon_amoy",
    name: "Polygon Amoy",
    chainId: 80002,
    isArc: false,
    supported: false,
    rpcUrl: "https://rpc-amoy.polygon.technology",
    explorerUrl: "https://amoy.polygonscan.com",
    hasDeterministicFinality: false,
    hasSponsorship: false,
  },
  avalanche_fuji: {
    id: "avalanche_fuji",
    name: "Avalanche Fuji",
    chainId: 43113,
    isArc: false,
    supported: false,
    rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
    explorerUrl: "https://testnet.snowtrace.io",
    hasDeterministicFinality: false,
    hasSponsorship: false,
  },
};

export function getNetworkMetadata(networkId: string): NetworkMetadata | undefined {
  return SUPPORTED_NETWORKS[networkId];
}

export function listSupportedNetworks(): NetworkMetadata[] {
  return Object.values(SUPPORTED_NETWORKS);
}

export function estimateRoute(params: {
  asset: string;
  amount: string;
  targetNetwork?: string;
}): RouteEstimate {
  const meta = params.targetNetwork ? SUPPORTED_NETWORKS[params.targetNetwork] : SUPPORTED_NETWORKS.arc_testnet;

  const isArc = meta?.isArc ?? true;

  return {
    routeId: `route_${isArc ? "arc" : "external"}_${Date.now()}`,
    sourceChain: "Arc Testnet (5042002)",
    destinationChain: meta ? `${meta.name} (${meta.chainId})` : "Arc Testnet (5042002)",
    asset: params.asset,
    amount: params.amount,
    estimatedFeeUsd: isArc ? "0.00 (Sponsored)" : "0.05",
    estimatedLatencyMs: isArc ? 400 : 2500,
    isSponsored: isArc,
    deterministic: isArc,
    priorityScore: isArc ? 100 : 40,
  };
}
