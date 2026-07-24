import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const pk = generatePrivateKey();
const account = privateKeyToAccount(pk);
const issuedAt = new Date().toISOString();
const message = `Sign this message to verify ownership of your wallet and activate your Coretta session.

Address: ${account.address}
Chain ID: 5042002
Issued At: ${issuedAt}

This request will not trigger a blockchain transaction or cost any gas fees.`;
const signature = await account.signMessage({ message });

const authRes = await fetch("http://127.0.0.1:3001/v1/auth/wallet", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ address: account.address, message, signature }),
});
const auth = await authRes.json();
console.log("auth status", authRes.status);
if (!authRes.ok) {
  console.log(auth);
  process.exit(1);
}
console.log("wallet", auth.walletAddress);
console.log("metrics after auth", {
  live: auth.metrics.live,
  connectionCount: auth.metrics.connectionCount,
  signatureRequestCount: auth.metrics.signatureRequestCount,
  voiceRequestCount: auth.metrics.voiceRequestCount,
});

const token = auth.token;
const usageRes = await fetch(
  `http://127.0.0.1:3001/v1/user/usage?walletAddress=${encodeURIComponent(account.address)}`,
  { headers: { Authorization: `Bearer ${token}` } },
);
const usage = await usageRes.json();
console.log("usage status", usageRes.status, {
  live: usage.live,
  walletAddress: usage.walletAddress,
  connectionCount: usage.connectionCount,
  signatureRequestCount: usage.signatureRequestCount,
});

const trackRes = await fetch("http://127.0.0.1:3001/v1/usage/track", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ action: "voice", walletAddress: account.address }),
});
const track = await trackRes.json();
console.log("track ok", track.ok, "voice", track.metrics?.voiceRequestCount);

const usage2Res = await fetch(
  `http://127.0.0.1:3001/v1/user/usage?walletAddress=${encodeURIComponent(account.address)}`,
  { headers: { Authorization: `Bearer ${token}` } },
);
const usage2 = await usage2Res.json();
console.log("usage after voice", {
  voiceRequestCount: usage2.voiceRequestCount,
  live: usage2.live,
  addr: usage2.walletAddress,
});

// Second wallet should have independent counters
const pk2 = generatePrivateKey();
const account2 = privateKeyToAccount(pk2);
const issuedAt2 = new Date().toISOString();
const message2 = `Sign this message to verify ownership of your wallet and activate your Coretta session.

Address: ${account2.address}
Chain ID: 5042002
Issued At: ${issuedAt2}

This request will not trigger a blockchain transaction or cost any gas fees.`;
const signature2 = await account2.signMessage({ message: message2 });
const auth2Res = await fetch("http://127.0.0.1:3001/v1/auth/wallet", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    address: account2.address,
    message: message2,
    signature: signature2,
  }),
});
const auth2 = await auth2Res.json();
console.log("wallet2 metrics", {
  voice: auth2.metrics?.voiceRequestCount,
  connections: auth2.metrics?.connectionCount,
  addr: auth2.walletAddress,
});
