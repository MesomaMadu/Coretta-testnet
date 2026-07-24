import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { generateEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";

const apiKeyValue = process.env.CIRCLE_API_KEY;
if (!apiKeyValue) {
  throw new Error("CIRCLE_API_KEY is required. Set it in .env first.");
}
const apiKey: string = apiKeyValue;

// Refuse to overwrite an existing entity secret in .env.
/*const existingEnv: string = existsSync(".env")
  ? readFileSync(".env", "utf8")
  : "";
if (/^CIRCLE_ENTITY_SECRET=/m.test(existingEnv)) {
  throw new Error(
    "CIRCLE_ENTITY_SECRET already exists in .env. Refusing to overwrite it.",
  );
}
*/

// Generate a 32-byte entity secret. The SDK's generateEntitySecret() helper
// prints to stdout but doesn't return the value, so use crypto directly.
const entitySecretValue = process.env.CIRCLE_ENTITY_SECRET;
if (!entitySecretValue) {
  throw new Error("CIRCLE_ENTITY_SECRET is required in .env");
}
const entitySecret: string = entitySecretValue;
const recoveryFilePath: string = "./recovery";

mkdirSync(recoveryFilePath, { recursive: true });

async function main() {
  const ciphertext = await generateEntitySecretCiphertext({
    apiKey,
    entitySecret,
  });

  console.log("\nEntity Secret Ciphertext:\n");
  console.log(ciphertext);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// For production, prefer a secrets manager over .env.
appendFileSync(".env", `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`);

console.log("Entity secret registered.");
console.log(`Recovery file saved to a new file in: ${recoveryFilePath}`);
console.log("CIRCLE_ENTITY_SECRET added to .env");