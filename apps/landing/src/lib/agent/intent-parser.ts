import type { AssetSymbol } from "@/lib/chains";
import type { AllowedAction, ParseResult } from "./types";
import { assessBatchRisk, parseMultiSend } from "./multi-send";
import { detectPromptInjection, validateAmountToken } from "./security";

function parseAmount(raw: string): string | null {
  const m = raw.match(/(\d+(?:\.\d{1,6})?)/);
  if (!m || !validateAmountToken(m[1])) return null;
  return m[1];
}

function parseRecipient(text: string): string | null {
  if (/\bsmart\s+wallet\b/i.test(text)) {
    return "__BOUND_SMART_WALLET__";
  }
  if (
    /\b(my|main|connected)\s+wallet\b/i.test(text) ||
    /\bto myself\b/i.test(text) ||
    /\bmy balance to\b/i.test(text)
  ) {
    return "__BOUND_MAIN_WALLET__";
  }
  // Prefer full EVM addresses (never treat 0x… as a name)
  const evm = text.match(/0x[a-fA-F0-9]{40}/i);
  if (evm) return evm[0];
  const email = text.match(/[\w.+-]+@[\w.-]+\.\w+/);
  if (email) return email[0];
  // Names only: letters first, no 0x prefix
  const toMatch = text.match(
    /(?:to|for)\s+([A-Za-z][A-Za-z0-9\s.'-]{0,40}?)(?:\s|$|\.|,)/i,
  );
  if (toMatch) {
    const name = toMatch[1].trim();
    // Guard: never accept a partial/broken hex as a name
    if (/^0x/i.test(name) || /\b0x[a-fA-F0-9]/i.test(name)) return null;
    return name;
  }
  return null;
}

function detectAsset(text: string): AssetSymbol | null {
  if (/\bEURC\b/i.test(text) || /€/.test(text)) return "EURC";
  if (/\bUSDC\b/i.test(text) || /\$/.test(text)) return "USDC";
  return null;
}

export function parseUserIntent(input: string): ParseResult {
  const injection = detectPromptInjection(input);
  if (injection) {
    return { ok: false, reason: "blocked", message: injection };
  }

  const text = input.trim();
  const lower = text.toLowerCase();

  if (text.length < 3) {
    return {
      ok: false,
      reason: "ambiguous",
      message: "Tell me who to pay and how much, for example: “Send 50 USDC to Sarah.”",
    };
  }

  const swapAndSend =
    /convert\s+(\d+(?:\.\d+)?)\s*(USDC|EURC)\s+to\s+(USDC|EURC)(?:\s+and\s+send)?/i.exec(
      text,
    );
  if (swapAndSend) {
    const amount = parseAmount(swapAndSend[1]);
    const from = swapAndSend[2].toUpperCase() as AssetSymbol;
    const to = swapAndSend[3].toUpperCase() as AssetSymbol;
    const recipient = parseRecipient(text);
    if (!amount) {
      return { ok: false, reason: "ambiguous", message: "What amount would you like to convert? (Max $100 per transfer.)" };
    }
    if (!recipient) {
      return { ok: false, reason: "ambiguous", message: "Who should receive the funds after the swap?" };
    }
    const action: AllowedAction =
      from === "USDC" ? "swapUSDCtoEURC" : "swapEURCtoUSDC";
    return {
      ok: true,
      preview: {
        action,
        recipient,
        amount,
        asset: from,
        receiveAsset: to,
        receiveAmount: amount,
        swapRoute: `${from} → ${to} (preview only)`,
        sponsorship: "sponsored",
        network: "Arc Testnet",
        executionPath: "Swap → Smart wallet → Bundler → Arc settlement",
        riskWarning:
          "Swap settles via Circle App Kit on Arc Testnet. Wallet must be eligible (Circle developer-controlled wallet / funded SCA). USDC is the native gas token on Arc.",
      },
    };
  }

  // Arc: USDC is gas — reject USDC↔native phrasing early
  if (/\b(swap|convert)\b/i.test(text) && /\bnative\b/i.test(text) && /\bUSDC\b/i.test(text)) {
    return {
      ok: false,
      reason: "blocked",
      message: "Already using network gas token.",
    };
  }

  const swapOnly = /swap\s+(\d+(?:\.\d+)?)\s*(USDC|EURC)\s+to\s+(USDC|EURC)/i.exec(text);
  if (swapOnly) {
    const amount = parseAmount(swapOnly[1]);
    const from = swapOnly[2].toUpperCase() as AssetSymbol;
    const to = swapOnly[3].toUpperCase() as AssetSymbol;
    if (!amount) {
      return { ok: false, reason: "ambiguous", message: "How much would you like to swap?" };
    }
    if (from === to) {
      return {
        ok: false,
        reason: "ambiguous",
        message: "Source and destination assets are the same. Pick different assets to swap.",
      };
    }
    const action: AllowedAction =
      from === "USDC" ? "swapUSDCtoEURC" : "swapEURCtoUSDC";
    return {
      ok: true,
      preview: {
        action,
        recipient: "Your wallet",
        amount,
        asset: from,
        receiveAsset: to,
        receiveAmount: amount,
        swapRoute: `${from} → ${to}`,
        sponsorship: "sponsored",
        network: "Arc Testnet",
        executionPath: "App Kit swap on Arc_Testnet",
      },
    };
  }

  const defaultAsset = detectAsset(text) ?? "USDC";
  const multi = parseMultiSend(text, defaultAsset);
  if (multi && multi.recipients.length >= 2) {
    const action: AllowedAction = multi.asset === "USDC" ? "sendUSDC" : "sendEURC";
    const n = multi.recipients.length;
    const summary = multi.recipients
      .map((r) => {
        if (r.identityType === "address") {
          return `${r.amount} ${multi.asset} → ${r.name.slice(0, 6)}…${r.name.slice(-4)}`;
        }
        return `${r.amount} ${multi.asset} → ${r.name}`;
      })
      .join("; ");
    const riskWarning = assessBatchRisk(multi.recipients, multi.total);
    return {
      ok: true,
      preview: {
        action,
        recipient: `${n} wallet${n === 1 ? "" : "s"}`,
        amount: multi.total,
        asset: multi.asset,
        batch: multi.recipients,
        totalAmount: multi.total,
        recipientCount: n,
        riskWarning,
        sponsorship: "sponsored",
        network: "Arc Testnet",
        executionPath: `Batch → ${n} wallets · ${summary}`,
      },
    };
  }

  const recipientFirstSend =
    /(?:send|transfer|pay)\s+(.+?)\s+(?:another\s+)?(\d+(?:\.\d+)?)\s*(USDC|EURC)\b/i.exec(
      text,
    );
  if (recipientFirstSend) {
    const recipientText = recipientFirstSend[1]?.trim().replace(/[.!?]$/, "") ?? "";
    const amount = parseAmount(recipientFirstSend[2]);
    const asset = recipientFirstSend[3].toUpperCase() as AssetSymbol;
    const evm = recipientText.match(/0x[a-fA-F0-9]{40}/i)?.[0];
    const email = recipientText.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0];
    const recipient =
      evm ||
      email ||
      parseRecipient(`to ${recipientText}`) ||
      (!/^0x/i.test(recipientText) && !recipientText.includes("0x") ? recipientText : null);

    if (!amount) {
      return { ok: false, reason: "ambiguous", message: "What amount should I send? (Max $100.)" };
    }
    if (!recipient) {
      return {
        ok: false,
        reason: "ambiguous",
        message: "Who is the recipient? Use a full EVM address, email, or saved name.",
      };
    }

    return {
      ok: true,
      preview: {
        action: asset === "USDC" ? "sendUSDC" : "sendEURC",
        recipient,
        amount,
        asset,
        sponsorship: "sponsored",
        network: "Arc Testnet",
        executionPath: "Smart wallet -> Paymaster -> Bundler -> Arc",
      },
    };
  }

  const sendMatch =
    /send\s+(\d+(?:\.\d+)?)\s*(USDC|EURC)?\s*(?:to|for)\s+(.+)/i.exec(text) ||
    /transfer\s+(\d+(?:\.\d+)?)\s*(USDC|EURC)?\s*(?:to|for)\s+(.+)/i.exec(text);
  if (sendMatch) {
    const amount = parseAmount(sendMatch[1]);
    let asset = (sendMatch[2]?.toUpperCase() as AssetSymbol) || detectAsset(text);
    const tail = sendMatch[3]?.trim().replace(/[.!?]$/, "") ?? "";
    // Prefer a full address/email in the tail; do not treat hex as a name.
    const evmInTail = tail.match(/0x[a-fA-F0-9]{40}/i);
    const emailInTail = tail.match(/[\w.+-]+@[\w.-]+\.\w+/);
    const recipient =
      (evmInTail ? evmInTail[0] : null) ||
      (emailInTail ? emailInTail[0] : null) ||
      parseRecipient(text) ||
      // Only fall back to free-text tail if it is clearly a name (no 0x)
      (!/^0x/i.test(tail) && !tail.includes("0x") ? tail : null);
    if (!amount) {
      return { ok: false, reason: "ambiguous", message: "What amount should I send? (Max $100.)" };
    }
    if (!asset) {
      return {
        ok: false,
        reason: "ambiguous",
        message: "Which asset should I send, USDC or EURC?",
      };
    }
    if (!recipient) {
      return {
        ok: false,
        reason: "ambiguous",
        message:
          "Who is the recipient? Use a full EVM address (0x…), email, or name.",
      };
    }
    const action: AllowedAction = asset === "USDC" ? "sendUSDC" : "sendEURC";
    return {
      ok: true,
      preview: {
        action,
        recipient,
        amount,
        asset,
        sponsorship: "sponsored",
        network: "Arc Testnet",
        executionPath: "Smart wallet → Paymaster → Bundler → Arc",
      },
    };
  }

  const euroSend = /send\s+€\s*(\d+(?:\.\d+)?)\s*(?:to|for)\s+(.+)/i.exec(text);
  if (euroSend) {
    const amount = parseAmount(euroSend[1]);
    const recipient = euroSend[2]?.trim();
    if (!amount || !recipient) {
      return { ok: false, reason: "ambiguous", message: "Please specify amount and recipient for your EURC transfer." };
    }
    return {
      ok: true,
      preview: {
        action: "sendEURC",
        recipient,
        amount,
        asset: "EURC",
        sponsorship: "sponsored",
        network: "Arc Testnet",
        executionPath: "Smart wallet → Paymaster → Bundler → Arc",
      },
    };
  }

  if (lower.includes("help") || lower.includes("what can")) {
    return {
      ok: false,
      reason: "unsupported",
      message:
        "I can help you send USDC or EURC, or swap between them. Try: “Send 50 USDC to david@email.com” or “Convert 100 USDC to EURC and send to Sarah.”",
    };
  }

  return {
    ok: false,
    reason: "ambiguous",
    message:
      "I need a clear instruction. Example: “Send 25 USDC to Alex” or “Swap 50 USDC to EURC.”",
  };
}
