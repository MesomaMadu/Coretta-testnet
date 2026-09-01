export const CCTP_SOURCE_CHAIN = "Arc_Testnet" as const;

/** Maximum number of read-only attestation checks for one bridge attempt. */
export const CCTP_RECOVERY_ATTEMPT_LIMIT = 30;

export const CCTP_EVM_TESTNET_DESTINATIONS = [
  { id: "Arbitrum_Sepolia", label: "Arbitrum Sepolia", aliases: ["arbitrum", "arbitrum sepolia", "arb sepolia"] },
  { id: "Avalanche_Fuji", label: "Avalanche Fuji", aliases: ["avalanche", "avalanche fuji", "fuji"] },
  { id: "Base_Sepolia", label: "Base Sepolia", aliases: ["base", "base sepolia"] },
  { id: "Codex_Testnet", label: "Codex Testnet", aliases: ["codex", "codex testnet"] },
  { id: "Edge_Testnet", label: "EDGE Testnet", aliases: ["edge", "edge testnet"] },
  { id: "Ethereum_Sepolia", label: "Ethereum Sepolia", aliases: ["ethereum", "ethereum sepolia", "eth sepolia", "sepolia"] },
  { id: "HyperEVM_Testnet", label: "HyperEVM Testnet", aliases: ["hyperevm", "hyperevm testnet", "hyper evm"] },
  { id: "Injective_Testnet", label: "Injective Testnet", aliases: ["injective", "injective testnet", "injective evm"] },
  { id: "Ink_Testnet", label: "Ink Testnet", aliases: ["ink", "ink testnet", "ink sepolia"] },
  { id: "Linea_Sepolia", label: "Linea Sepolia", aliases: ["linea", "linea sepolia"] },
  { id: "Monad_Testnet", label: "Monad Testnet", aliases: ["monad", "monad testnet"] },
  { id: "Morph_Testnet", label: "Morph Hoodi Testnet", aliases: ["morph", "morph testnet", "morph hoodi", "morph hoodi testnet"] },
  { id: "Optimism_Sepolia", label: "OP Sepolia", aliases: ["optimism", "optimism sepolia", "op sepolia"] },
  { id: "Pharos_Testnet", label: "Pharos Atlantic Testnet", aliases: ["pharos", "pharos testnet", "pharos atlantic", "pharos atlantic testnet"] },
  { id: "Plume_Testnet", label: "Plume Testnet", aliases: ["plume", "plume testnet"] },
  { id: "Polygon_Amoy_Testnet", label: "Polygon Amoy", aliases: ["polygon", "polygon amoy", "amoy"] },
  { id: "Sei_Testnet", label: "Sei Testnet", aliases: ["sei", "sei testnet"] },
  { id: "Sonic_Testnet", label: "Sonic Testnet", aliases: ["sonic", "sonic testnet"] },
  { id: "Unichain_Sepolia", label: "Unichain Sepolia", aliases: ["unichain", "unichain sepolia"] },
  { id: "World_Chain_Sepolia", label: "World Chain Sepolia", aliases: ["world chain", "world chain sepolia", "worldchain"] },
  { id: "XDC_Apothem", label: "XDC Apothem", aliases: ["xdc", "xdc apothem", "apothem"] },
] as const;

export type CctpEvmTestnetDestination =
  (typeof CCTP_EVM_TESTNET_DESTINATIONS)[number];
export type CctpEvmTestnetChainId = CctpEvmTestnetDestination["id"];

export const CCTP_SCA_TESTNET_DESTINATION_IDS = [
  "Arbitrum_Sepolia",
  "Avalanche_Fuji",
  "Base_Sepolia",
  "Ethereum_Sepolia",
  "Monad_Testnet",
  "Optimism_Sepolia",
  "Polygon_Amoy_Testnet",
  "Unichain_Sepolia",
] as const satisfies readonly CctpEvmTestnetChainId[];

export function supportsCctpScaDestination(
  value: CctpEvmTestnetChainId,
) {
  return (CCTP_SCA_TESTNET_DESTINATION_IDS as readonly string[]).includes(value);
}

function phrasePattern(value: string) {
  return new RegExp(
    `\\b${value
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "[\\s_-]+")}(?:\\s+(?:network|chain|testnet))?\\b`,
    "i",
  );
}

/** Resolve a user-facing EVM testnet name to the exact App Kit identifier. */
export function resolveCctpEvmTestnetDestination(input: string) {
  const candidates = CCTP_EVM_TESTNET_DESTINATIONS.flatMap((chain) =>
    chain.aliases.map((alias) => ({ chain, alias })),
  ).sort((a, b) => b.alias.length - a.alias.length);
  return candidates.find(({ alias }) => phrasePattern(alias).test(input))?.chain ?? null;
}

/** Resolve every distinct supported destination named in one instruction. */
export function resolveCctpEvmTestnetDestinations(input: string) {
  const matches = CCTP_EVM_TESTNET_DESTINATIONS.flatMap((chain) => {
    const alias = [...chain.aliases]
      .sort((left, right) => right.length - left.length)
      .find((candidate) => phrasePattern(candidate).test(input));
    return alias ? [{ chain, alias }] : [];
  });
  const specific = matches.filter(({ alias }) => alias.toLowerCase() !== "sepolia");
  return (specific.length > 0 ? specific : matches).map(({ chain }) => chain);
}

export type CctpDestinationMention = {
  chain: CctpEvmTestnetDestination;
  start: number;
  end: number;
};

/** Find supported network mentions in reading order without overlapping aliases. */
export function findCctpEvmTestnetDestinationMentions(
  input: string,
): CctpDestinationMention[] {
  const candidates = CCTP_EVM_TESTNET_DESTINATIONS.flatMap((chain) =>
    [...chain.aliases]
      .sort((left, right) => right.length - left.length)
      .flatMap((alias) => {
        const pattern = new RegExp(phrasePattern(alias).source, "gi");
        return [...input.matchAll(pattern)].map((match) => ({
          chain,
          start: match.index ?? 0,
          end: (match.index ?? 0) + match[0].length,
          aliasLength: alias.length,
        }));
      }),
  ).sort(
    (left, right) =>
      left.start - right.start ||
      right.aliasLength - left.aliasLength ||
      right.end - left.end,
  );

  const selected: CctpDestinationMention[] = [];
  for (const candidate of candidates) {
    if (
      selected.some(
        (mention) =>
          candidate.start < mention.end && candidate.end > mention.start,
      )
    ) {
      continue;
    }
    selected.push({
      chain: candidate.chain,
      start: candidate.start,
      end: candidate.end,
    });
  }
  return selected.sort((left, right) => left.start - right.start);
}

export function isCctpEvmTestnetChainId(
  value: string,
): value is CctpEvmTestnetChainId {
  return CCTP_EVM_TESTNET_DESTINATIONS.some((chain) => chain.id === value);
}
