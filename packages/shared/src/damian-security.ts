export type DamianSecurityCode =
  | "instruction_override"
  | "role_manipulation"
  | "prompt_exfiltration"
  | "transaction_bypass"
  | "secret_exposure"
  | "privileged_access"
  | "account_exfiltration"
  | "obfuscated_instruction";

export type DamianSecurityAssessment =
  | { allowed: true; normalized: string }
  | {
      allowed: false;
      normalized: string;
      code: DamianSecurityCode;
      response: string;
    };

const INVISIBLE_OR_DIRECTIONAL =
  /[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const SPACED_WORD = /\b(?:[a-z]\s+){3,}[a-z]\b/gi;

export function normalizeDamianSecurityText(value: string) {
  return value
    .normalize("NFKC")
    .replace(INVISIBLE_OR_DIRECTIONAL, "")
    .replace(CONTROL_CHARACTERS, " ")
    .replace(SPACED_WORD, (word) => word.replace(/\s+/g, ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5_000);
}

function scanVariant(value: string) {
  return value
    .toLowerCase()
    .replace(/[013457]/g, (character) =>
      ({ "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t" })[
        character
      ] ?? character,
    );
}

type SecurityRule = {
  code: DamianSecurityCode;
  patterns: RegExp[];
  response: string;
};

const RULES: SecurityRule[] = [
  {
    code: "instruction_override",
    patterns: [
      /\b(?:ignore|disregard|forget|override|supersede|discard)\b.{0,80}\b(?:previous|prior|above|earlier|system|developer|security|safety|policy|rules?|instructions?|constraints?)\b/i,
      /\b(?:previous|prior|system|developer|security|safety|policy|rules?|instructions?|constraints?)\b.{0,80}\b(?:ignore|disregard|forget|override|supersede|discard)\b/i,
      /\b(?:disable|remove|turn off)\b.{0,50}\b(?:guardrails?|safeguards?|security checks?|safety rules?)\b/i,
    ],
    response:
      "I can't change or ignore Coretta's safeguards. I can still help with a specific USDC or EURC payment, balance, route, approval, or transaction check.",
  },
  {
    code: "role_manipulation",
    patterns: [
      /\b(?:you are now|act as|pretend to be|roleplay as|switch to)\b.{0,80}\b(?:admin|administrator|developer|system|operator|signer|unrestricted|uncensored|root|owner)\b/i,
      /\b(?:jailbreak|developer mode|god mode|dan mode|unrestricted mode)\b/i,
      /\b(?:impersonate|pretend to be)\b.{0,60}\b(?:account owner|wallet owner|recipient|support agent|administrator|developer)\b/i,
    ],
    response:
      "I can't take on a privileged role or impersonate anyone. I can only work within your verified Coretta session and the actions Coretta supports.",
  },
  {
    code: "prompt_exfiltration",
    patterns: [
      /\b(?:show|reveal|repeat|print|display|leak|expose|copy|quote|return)\b.{0,60}\b(?:system|developer|hidden|internal)\b.{0,30}\b(?:prompt|message|instructions?|rules?|policy)\b/i,
      /\b(?:what|where)\b.{0,30}\b(?:system|developer|hidden|internal)\s+(?:prompt|instructions?|rules?)\b/i,
      /\b(?:dump|export)\b.{0,40}\b(?:conversation context|hidden context|model context|prompt)\b/i,
    ],
    response:
      "I can't expose hidden instructions or internal configuration. I can explain what Damian can do and the safeguards that apply to a payment.",
  },
  {
    code: "transaction_bypass",
    patterns: [
      /\b(?:bypass|skip|disable|remove|avoid)\b.{0,60}\b(?:confirmation|confirming|preview|review|approval|signature|policy|limits?|security)\b/i,
      /\b(?:send|transfer|pay|swap|execute|submit|approve|sign)\b.{0,90}\bwithout\b.{0,40}\b(?:confirmation|confirming|preview|review|approval|signature|policy check)\b/i,
      /\b(?:override|change|replace|inject)\b.{0,60}\b(?:recipient|amount|asset|token|network|route)\b.{0,60}\b(?:after|locked|preview|confirmation|signature)\b/i,
      /\b(?:forge|fake)\b.{0,50}\b(?:signature|approval|receipt|identity|wallet ownership|settlement)\b/i,
      /\bmark\b.{0,40}\b(?:transaction|transfer|payment)\b.{0,30}\bsettled\b/i,
      /\b(?:drain|empty)\b.{0,50}\b(?:wallet|account|balance)\b/i,
      /\b(?:send|transfer|pay|swap)\b.{0,50}\b(?:all|everything|entire|maximum|max)\b.{0,50}\b(?:funds|money|balance|wallet|usdc|eurc)\b/i,
      /\bapprove\b.{0,30}\b(?:unlimited|infinite|max(?:imum)?)\b/i,
      /\b(?:hidden|invisible|silent)\b.{0,30}\b(?:transfer|transaction|payment)\b/i,
      /\bexecute\b.{0,30}\barbitrary\b/i,
    ],
    response:
      "I can't bypass a preview, confirmation, approval, signature, policy check, or transaction limit. Give me the exact payment details and I'll prepare a locked preview for review.",
  },
  {
    code: "secret_exposure",
    patterns: [
      /\b(?:show|reveal|read|export|send|share|provide|give|paste|tell)\b.{0,70}\b(?:seed phrase|recovery phrase|mnemonic|private key|api key|password|one[- ]time code|otp|auth token|database url)\b/i,
      /\b(?:seed phrase|recovery phrase|mnemonic)\b\s*(?::|is)\s*(?:[a-z]{3,}\s+){7,}[a-z]{3,}\b/i,
      /\b(?:private key|api key|password|one[- ]time code|otp|auth token|database url)\b\s*(?::|is)\s*\S{6,}/i,
      /\b(?:send|transfer|pay|bridge|remit|forward)\b.{0,160}\b(?:to|recipient|address)\b.{0,40}\b0x[a-fA-F0-9]{64}\b/i,
    ],
    response:
      "Don't share seed phrases, private keys, passwords, API keys, or one-time codes here. Damian never needs them to help with a Coretta transaction.",
  },
  {
    code: "privileged_access",
    patterns: [
      /\b(?:access|open|read|query|modify|change|delete|dump|download|upload|run|execute|launch)\b.{0,90}\b(?:database|server|filesystem|file system|terminal|shell|environment variables?|admin panel|github|vercel|email inbox|browser session)\b/i,
      /\b(?:use|call|activate)\b.{0,50}\b(?:hidden|unavailable|unauthorized|internal)\b.{0,40}\b(?:tool|api|function|endpoint)\b/i,
    ],
    response:
      "I don't have access to admin tools, servers, databases, files, inboxes, deployment systems, or hidden APIs. I can help only through Coretta's approved payment and account features.",
  },
  {
    code: "account_exfiltration",
    patterns: [
      /\b(?:show|give|fetch|find|read|list|export|reveal)\b.{0,70}\b(?:another user|other users?|someone else(?:'s)?)\b.{0,70}\b(?:account|balance|history|transactions?|wallet|recipients?|identity)\b/i,
      /\b(?:another user|other users?|someone else(?:'s)?)\b.{0,70}\b(?:account|balance|history|transactions?|wallet|recipients?|identity)\b.{0,70}\b(?:show|give|fetch|find|read|list|export|reveal)\b/i,
    ],
    response:
      "I can only use information authorized for your signed-in Coretta account. I can't retrieve another person's balance, history, wallet details, or identity.",
  },
  {
    code: "obfuscated_instruction",
    patterns: [
      /\b(?:decode|decrypt|translate|unpack|interpret)\b.{0,80}\b(?:base64|hex|encoded|cipher|hidden)\b.{0,80}\b(?:follow|obey|execute|run|instruction|command)\b/i,
      /\b(?:follow|obey|execute|run)\b.{0,80}\b(?:encoded|base64|hidden|embedded)\b.{0,50}\b(?:instructions?|commands?|text)\b/i,
    ],
    response:
      "I won't decode or follow hidden instructions. State the Coretta action you want in plain language, with a clear amount, asset, and recipient when it involves a payment.",
  },
];

export function assessDamianInputSecurity(input: string): DamianSecurityAssessment {
  const normalized = normalizeDamianSecurityText(input);
  const variants = [normalized, scanVariant(normalized)];
  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => variants.some((variant) => pattern.test(variant)))) {
      return {
        allowed: false,
        normalized,
        code: rule.code,
        response: rule.response,
      };
    }
  }
  return { allowed: true, normalized };
}

const UNSAFE_MODEL_OUTPUT = [
  /\bI(?:'ve| have)\s+(?:just\s+)?(?:sent|transferred|paid|swapped|signed|approved|executed|submitted|settled|cancelled)\b/i,
  /\b(?:send|share|provide|enter|paste|tell|give)\s+(?:me\s+)?(?:your\s+)?(?:seed phrase|recovery phrase|mnemonic|private key|api key|password|one[- ]time code|otp|auth token)\b/i,
  /\b(?:skip|bypass|disable|avoid)\b.{0,50}\b(?:confirmation|preview|approval|signature|policy|limit|security)\b/i,
  /\b(?:here is|these are)\b.{0,30}\b(?:system|developer|hidden|internal)\b.{0,20}\b(?:prompt|instructions?|rules?)\b/i,
  /\bI\s+(?:can|will|am going to)\s+(?:access|query|modify|delete|open|run)\b.{0,70}\b(?:database|server|filesystem|terminal|shell|admin panel|github|vercel|email inbox)\b/i,
];

export function isDamianModelReplySafe(reply: string) {
  const normalized = normalizeDamianSecurityText(reply);
  return normalized.length > 0 && !UNSAFE_MODEL_OUTPUT.some((pattern) => pattern.test(normalized));
}
