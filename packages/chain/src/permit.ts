/**
 * EIP-2612 permit signing for Circle Paymaster — from Circle quickstart.
 * https://developers.circle.com/paymaster/pay-gas-fees-usdc
 */
import {
  type Address,
  type Hex,
  type PublicClient,
  erc20Abi,
  getContract,
  maxUint256,
  parseErc6492Signature,
} from "viem";
import type { SmartAccount } from "viem/account-abstraction";

export const eip2612Abi = [
  ...erc20Abi,
  {
    inputs: [{ internalType: "address", name: "owner", type: "address" }],
    stateMutability: "view",
    type: "function",
    name: "nonces",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
  },
  {
    inputs: [],
    name: "version",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

interface PermitToken {
  address: Address;
  read: {
    name: () => Promise<string>;
    version: () => Promise<string>;
    nonces: (args: readonly [Address]) => Promise<bigint>;
  };
}

export async function eip2612Permit({
  token,
  chainId,
  ownerAddress,
  spenderAddress,
  value,
}: {
  token: PermitToken;
  chainId: number;
  ownerAddress: Address;
  spenderAddress: Address;
  value: bigint;
}) {
  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit" as const,
    domain: {
      name: await token.read.name(),
      version: await token.read.version(),
      chainId: BigInt(chainId),
      verifyingContract: token.address,
    },
    message: {
      owner: ownerAddress,
      spender: spenderAddress,
      value,
      nonce: await token.read.nonces([ownerAddress]),
      deadline: maxUint256,
    },
  };
}

export async function signPermit({
  tokenAddress,
  client,
  account,
  spenderAddress,
  permitAmount,
}: {
  tokenAddress: Address;
  client: PublicClient;
  account: SmartAccount;
  spenderAddress: Address;
  permitAmount: bigint;
}): Promise<Hex> {
  const token = getContract({
    client,
    address: tokenAddress,
    abi: eip2612Abi,
  }) as unknown as PermitToken;

  const permitData = await eip2612Permit({
    token,
    chainId: client.chain!.id,
    ownerAddress: account.address,
    spenderAddress,
    value: permitAmount,
  });

  const wrappedPermitSignature = await account.signTypedData(
    permitData as Parameters<SmartAccount["signTypedData"]>[0],
  );
  const isValid = await client.verifyTypedData({
    ...permitData,
    address: account.address,
    signature: wrappedPermitSignature,
  } as Parameters<typeof client.verifyTypedData>[0]);

  if (!isValid) {
    throw new Error("INVALID_PERMIT_SIGNATURE");
  }

  const { signature } = parseErc6492Signature(wrappedPermitSignature);
  return signature;
}
