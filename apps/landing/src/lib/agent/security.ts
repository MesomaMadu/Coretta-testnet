import { assessDamianInputSecurity } from "@coretta/shared/damian-security";

const BLOCKED_AMOUNTS = [/^\s*all\s*$/i, /maximum/i, /everything/i];

export function detectPromptInjection(input: string): string | null {
  const assessment = assessDamianInputSecurity(input);
  return assessment.allowed ? null : assessment.response;
}

export function validateAmountToken(amountStr: string): boolean {
  if (BLOCKED_AMOUNTS.some((p) => p.test(amountStr))) return false;
  if (!/^\d+(?:\.\d{1,6})?$/.test(amountStr)) return false;
  const n = Number(amountStr);
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
