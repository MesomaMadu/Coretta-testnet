const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+(rules|instructions)/i,
  /send\s+all\s+(funds|money|balance)/i,
  /drain\s+(the\s+)?wallet/i,
  /approve\s+(unlimited|max|infinite)/i,
  /execute\s+arbitrary/i,
  /bypass\s+(confirmation|security)/i,
  /hidden\s+(transfer|transaction)/i,
  /override\s+(recipient|amount)/i,
  /system\s*prompt/i,
  /you\s+are\s+now/i,
  /disregard\s+safety/i,
];

const BLOCKED_AMOUNTS = [/^\s*all\s*$/i, /maximum/i, /everything/i];

export function detectPromptInjection(input: string): string | null {
  const trimmed = input.trim();
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return "I can't process requests that attempt to override security rules. Please describe a specific transfer with a clear amount and recipient.";
    }
  }
  return null;
}

export function validateAmountToken(amountStr: string): boolean {
  if (BLOCKED_AMOUNTS.some((p) => p.test(amountStr))) return false;
  const n = parseFloat(amountStr.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 && n <= 100;
}

export async function hashPreview(
  data: Record<string, string | number | undefined>,
): Promise<string> {
  const canonical = JSON.stringify(data, Object.keys(data).sort());
  const buf = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
