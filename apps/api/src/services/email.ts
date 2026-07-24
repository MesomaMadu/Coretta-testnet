/**
 * Email delivery abstraction.
 * Supports Resend API when EMAIL_PROVIDER_API_KEY is set.
 * In DEV_MODE without provider, logs OTP to server console only.
 */

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const from = process.env.EMAIL_FROM_ADDRESS || "Coretta Verification <onboarding@resend.dev>";

  if (!apiKey) {
    if (process.env.DEV_MODE === "true") {
      console.info(`[DEV_MODE OTP] ${to} → ${code}`);
      return;
    }
    throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Your Coretta verification code",
      text: `Your Coretta verification code is: ${code}\n\nThis code expires in 5 minutes.`,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[Resend Error] ${res.status}: ${body}`);
    throw new Error(`EMAIL_DELIVERY_FAILED:${res.status}:${body}`);
  }
}
