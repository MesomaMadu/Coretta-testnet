const CAPABILITY_WORDS = /\b(?:capabilit(?:y|ies)|what\s+can\s+you|what\s+do\s+you|supported\s+(?:actions?|features?))\b/i;
const HELP_REQUEST = /^(?:help|help\s+me|show(?:\s+me)?\s+help|help\s+menu|how\s+can\s+you\s+help(?:\s+me)?|what\s+can\s+you\s+help(?:\s+me)?\s+with)[!?.\s]*$/i;
const ROUTE_WORDS = /\b(?:(?:available|supported|current)\s+(?:routes?|networks?|chains?|assets?|tokens?|destinations?)|chain\s+routes?|routing|which\s+chains?|what(?:\s+are\s+the)?\s+(?:networks?|chains?|routes?|destinations?)|cctp\s+(?:routes?|networks?|chains?|destinations?)|where\s+can\s+(?:i|we)\s+bridge)\b/i;
const RECEIVE_WORDS = /\b(?:receive|receiving|incoming|payment\s+requests?|accept|reject)\b/i;
const GREETING_WORDS = /^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening))[!.\s]*$/i;
const THANKS_WORDS = /^(?:thanks|thank\s+you|much\s+appreciated|got\s+it)[!.\s]*$/i;
const IDENTITY_WORDS = /\b(?:who\s+are\s+you|what\s+are\s+you|tell\s+me\s+about\s+yourself)\b/i;
const WELLBEING_WORDS = /\b(?:how\s+are\s+you|how(?:'s|\s+is)\s+it\s+going)\b/i;

export type DamianBridgeDestination = {
  id: string;
  label: string;
};

export function isDamianRouteQuestion(input: string): boolean {
  return ROUTE_WORDS.test(input.trim());
}

export function formatDamianRouteAnswer(
  destinations: DamianBridgeDestination[],
): string {
  if (destinations.length === 0) {
    return [
      "Current network",
      "1. Arc Testnet supports USDC and EURC sends and swaps.",
      "",
      "CCTP destinations",
      "The live route registry isn't available right now, so I won't guess.",
    ].join("\n");
  }

  const labels = [...new Set(destinations.map((destination) => destination.label.trim()))]
    .filter(Boolean);
  return [
    "Current network",
    "1. Arc Testnet supports USDC and EURC sends and swaps.",
    "",
    "CCTP destinations for USDC",
    ...labels.map((label, index) => `${index + 1}. ${label}`),
    "",
    "Limits",
    "1. One locked plan can contain up to 20 transfers across supported chains.",
    "2. CCTP bridges USDC only.",
    "3. Every bridge requires your confirmation.",
  ].join("\n");
}

/** Read-only product questions never become transaction intents. */
export function answerDamianProductQuestion(input: string): string | null {
  const text = input.trim();
  if (GREETING_WORDS.test(text)) {
    return "Hi, I'm Damian. What are we working on today?";
  }
  if (THANKS_WORDS.test(text)) {
    return "You're welcome. I'm here when you're ready.";
  }
  if (WELLBEING_WORDS.test(text)) {
    return "I'm doing well and ready to help. What would you like to check or move?";
  }
  if (IDENTITY_WORDS.test(text)) {
    return "I'm Damian, Coretta's payments assistant. I help you understand balances and activity, prepare Arc Testnet payments and swaps, and keep every transaction behind a review and confirmation step.";
  }
  if (ROUTE_WORDS.test(text)) {
    return "Coretta's active payment network is Arc Testnet. I can send USDC or EURC there and swap between them. I couldn't load the live CCTP destination registry, so I won't guess which bridge routes are available.";
  }
  if (RECEIVE_WORDS.test(text) && /\b(?:how|can|show|check|manage|handle|about|explain|do)\b/i.test(text)) {
    return "When a Coretta payment request arrives, I'll show you who sent it, the amount, and Accept or Reject. Accepting triggers one more policy check before anything is submitted on-chain. A direct transfer that has already landed from outside Coretta can't be rejected, so I'll show it as received instead.";
  }
  if (CAPABILITY_WORDS.test(text) || HELP_REQUEST.test(text)) {
    return [
      "I can help with these tasks:",
      "1. Check USDC and EURC balances.",
      "2. Prepare sends and swaps on Arc Testnet.",
      "3. Bridge USDC across supported CCTP chains.",
      "4. Split one plan into as many as 20 transfers.",
      "5. Find transaction details and use saved recipients.",
      "6. Explain routes, limits, and incoming Coretta requests.",
      "",
      "Money moves only after you review and confirm a locked preview.",
    ].join("\n");
  }
  return null;
}
