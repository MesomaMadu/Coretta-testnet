import { listSupportedNetworks } from "@coretta/chain";
import type { RouteEstimate } from "@coretta/shared";
import { evaluateUserRisk } from "./risk.js";
import { getUserUsageMetrics } from "./limits.js";

export interface TransactionRouteRequest {
  senderUserId?: string;
  senderAsset: string;
  recipientAsset: string;
  recipientRegion?: string;
  targetNetworkId?: string;
  amount: string;
}

export async function determineOptimalRoute(
  req: TransactionRouteRequest
): Promise<RouteEstimate & { selectedReason: string }> {
  const networks = listSupportedNetworks();
  const arcNetwork = networks.find((n) => n.isArc) ?? networks[0];

  let selectedNetwork = arcNetwork;
  let reason = "Arc Testnet selected: primary settlement engine with deterministic sub-second finality and zero-gas USDC sponsorship.";

  if (req.targetNetworkId && req.targetNetworkId !== "arc_testnet") {
    const requested = networks.find((n) => n.id === req.targetNetworkId);
    if (requested && !requested.supported) {
      reason = `Requested network ${requested.name} is currently marked UNSUPPORTED due to lack of deterministic finality on testnet. Defaulting to Arc Testnet.`;
    }
  }

  let isSponsored = true;
  if (req.senderUserId) {
    const usage = await getUserUsageMetrics(req.senderUserId);
    const risk = await evaluateUserRisk(req.senderUserId);

    if (usage.sponsoredTxCount >= usage.sponsoredTxLimit || usage.sponsoredUsdSpent >= usage.sponsoredUsdLimit) {
      isSponsored = false;
      reason += " Sponsorship daily quota reached; settlement will require native gas.";
    } else if (!risk.allowSponsorship) {
      isSponsored = false;
      reason += " Risk assessment score requires direct transaction authorization.";
    }
  }

  return {
    routeId: `route_arc_${Date.now()}`,
    sourceChain: "Arc Testnet (5042002)",
    destinationChain: `${selectedNetwork.name} (${selectedNetwork.chainId})`,
    asset: req.senderAsset,
    amount: req.amount,
    estimatedFeeUsd: isSponsored ? "0.00 (Sponsored)" : "0.05",
    estimatedLatencyMs: 400,
    isSponsored,
    deterministic: true,
    priorityScore: 100,
    selectedReason: reason,
  };
}
