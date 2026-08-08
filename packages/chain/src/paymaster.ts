import { encodePacked, type Address } from "viem";
import type { PublicClient } from "viem";
import type { SmartAccount } from "viem/account-abstraction";
import { PAYMASTER_V07_ADDRESS, USDC_ADDRESS } from "@coretta/shared";
import { signPermit } from "./permit.js";

const DEFAULT_PERMIT_AMOUNT = 10_000_000n; // 10 USDC allowance headroom for fees

export function createCirclePaymaster({
  client,
  account,
  paymasterAddress = PAYMASTER_V07_ADDRESS,
  usdcAddress = USDC_ADDRESS as Address,
  permitAmount = DEFAULT_PERMIT_AMOUNT,
}: {
  client: PublicClient;
  account: SmartAccount;
  paymasterAddress?: Address;
  usdcAddress?: Address;
  permitAmount?: bigint;
}) {
  return {
    async getPaymasterData() {
      const permitSignature = await signPermit({
        tokenAddress: usdcAddress,
        account,
        client,
        spenderAddress: paymasterAddress,
        permitAmount,
      });

      const paymasterData = encodePacked(
        ["uint8", "address", "uint256", "bytes"],
        [0, usdcAddress, permitAmount, permitSignature],
      );

      return {
        paymaster: paymasterAddress,
        paymasterData,
        paymasterVerificationGasLimit: 200_000n,
        paymasterPostOpGasLimit: 15_000n,
        isFinal: true as const,
      };
    },
  };
}
