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
  // Prefer full EVM addresses over names/emails
  const evm = text.match(/0x[a-fA-F0-9]{40}/);
  if (evm) return evm[0];
  const email = text.match(/[\w.+-]+@[\w.-]+\.\w+/);
  if (email) return email[0];
  const toMatch = text.match(
    /(?:to|for)\s+([A-Za-z][A-Za-z0-9\s]{0,40}?)(?:\s|$|\.|,)/i,
  );
  if (toMatch) return toMatch[1].trim();
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
        sponsorship: "Circle Paymaster, gas sponsored in USDC",
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
        sponsorship: "Circle Paymaster, gas sponsored in USDC",
        network: "Arc Testnet",
        executionPath: "App Kit swap on Arc_Testnet",
        riskWarning:
          "Requires KIT_KEY + Circle wallet credentials on the server, and a funded wallet holding the source token.",
      },
    };
  }

  const defaultAsset = detectAsset(text) ?? "USDC";
  const multi = parseMultiSend(text, defaultAsset);
  if (multi && multi.recipients.length >= 2) {
    const action: AllowedAction = multi.asset === "USDC" ? "sendUSDC" : "sendEURC";
    const summary = multi.recipients.map((r) => r.name).join(", ");
    const riskWarning = assessBatchRisk(multi.recipients, multi.total);
    return {
      ok: true,
      preview: {
        action,
        recipient: `${multi.recipients.length} recipients`,
        amount: multi.total,
        asset: multi.asset,
        batch: multi.recipients,
        totalAmount: multi.total,
        recipientCount: multi.recipients.length,
        riskWarning,
        sponsorship: "Circle Paymaster, gas sponsored in USDC",
        network: "Arc Testnet",
        executionPath: `Batch UserOp → ${multi.recipients.length} transfers (single signature) · ${summary}`,
      },
    };
  }

  const sendMatch =
    /send\s+(\d+(?:\.\d+)?)\s*(USDC|EURC)?\s*(?:to|for)\s+(.+)/i.exec(text) ||
    /transfer\s+(\d+(?:\.\d+)?)\s*(USDC|EURC)?\s*(?:to|for)\s+(.+)/i.exec(text);
  if (sendMatch) {
    const amount = parseAmount(sendMatch[1]);
    let asset = (sendMatch[2]?.toUpperCase() as AssetSymbol) || detectAsset(text);
    const recipient = sendMatch[3]?.trim().replace(/[.!?]$/, "") || parseRecipient(text);
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
      return { ok: false, reason: "ambiguous", message: "Who is the recipient? Use a name or email." };
    }
    const action: AllowedAction = asset === "USDC" ? "sendUSDC" : "sendEURC";
    return {
      ok: true,
      preview: {
        action,
        recipient,
        amount,
        asset,
        sponsorship: "Circle Paymaster, gas sponsored in USDC",
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
        sponsorship: "Circle Paymaster, gas sponsored in USDC",
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
