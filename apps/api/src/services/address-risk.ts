import { createPublicClient, http, type Address } from "viem";
import { prisma } from "@coretta/db";
import { CCTP_SOURCE_CHAIN } from "@coretta/shared";
import { config } from "../config.js";
import { getCctpChainDefinition } from "./cctp.js";

function addressSet(value: string) {
  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => /^0x[a-f0-9]{40}$/.test(entry)),
  );
}

function rpcForChain(chain: string) {
  if (chain === CCTP_SOURCE_CHAIN) return config.arcRpcUrl;
  return getCctpChainDefinition(chain).rpcEndpoints[0];
}

export type RecipientRiskCategory =
  | "externally_owned"
  | "known_coretta_wallet"
  | "allowed_contract"
  | "contract"
  | "known_scam"
  | "unverified";

export interface RecipientRiskAssessment {
  address: string;
  chain: string;
  allowed: boolean;
  category: RecipientRiskCategory;
  message: string;
}

export async function assessEvmRecipient(input: {
  address: string;
  chain: string;
}): Promise<RecipientRiskAssessment> {
  const address = input.address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return {
      address,
      chain: input.chain,
      allowed: false,
      category: "unverified",
      message: "The recipient is not a valid EVM address.",
    };
  }

  if (addressSet(config.blockedEvmAddresses).has(address)) {
    return {
      address,
      chain: input.chain,
      allowed: false,
      category: "known_scam",
      message: "This address is on Coretta's configured scam and sanctions blocklist.",
    };
  }

  const knownWallet = await prisma.wallet.findFirst({
    where: { OR: [{ scaAddress: address }, { ownerAddress: address }] },
    select: { id: true },
  });
  if (knownWallet) {
    return {
      address,
      chain: input.chain,
      allowed: true,
      category: "known_coretta_wallet",
      message: "Recipient is a wallet already known to Coretta.",
    };
  }

  try {
    const rpcUrl = rpcForChain(input.chain);
    if (!rpcUrl) throw new Error("RPC_UNAVAILABLE");
    const client = createPublicClient({ transport: http(rpcUrl) });
    const bytecode = await client.getBytecode({ address: address as Address });
    const isContract = Boolean(bytecode && bytecode !== "0x");
    if (!isContract) {
      return {
        address,
        chain: input.chain,
        allowed: true,
        category: "externally_owned",
        message: "Recipient is an externally owned EVM address.",
      };
    }
    if (addressSet(config.allowedContractAddresses).has(address)) {
      return {
        address,
        chain: input.chain,
        allowed: true,
        category: "allowed_contract",
        message: "Recipient is a contract explicitly allowlisted by Coretta.",
      };
    }
    return {
      address,
      chain: input.chain,
      allowed: false,
      category: "contract",
      message:
        "That recipient is a smart contract. Coretta blocks direct transfers to unknown contracts because funds may be unrecoverable.",
    };
  } catch {
    return {
      address,
      chain: input.chain,
      allowed: false,
      category: "unverified",
      message:
        "Coretta couldn't verify whether this recipient is a wallet or contract. Try again before creating a preview.",
    };
  }
}
