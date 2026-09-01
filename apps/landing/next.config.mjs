import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@coretta/shared"],
  webpack: (config, { dev }) => {
    // Webpack's filesystem cache cannot snapshot this linked monorepo reliably
    // on Windows. Keep caching enabled in memory locally, and preserve Next's
    // normal filesystem cache on Linux production builders such as Vercel.
    if (process.platform === "win32" && config.cache && !dev) {
      config.cache = Object.freeze({ type: "memory" });
    }
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      // Privy loads this optional integration only inside Farcaster Solana mini apps.
      "@farcaster/mini-app-solana": false,
      // Avoid @wagmi/connectors barrel (pulls optional coinbase/metamask/porto deps).
      "@wagmi/connectors/walletConnect": path.join(
        __dirname,
        "node_modules/@wagmi/connectors/dist/esm/walletConnect.js",
      ),
    };
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /[\\/]ox[\\/]_esm[\\/]tempo[\\/]internal[\\/]virtualMasterPool\.js$/,
        message: /the request of a dependency is an expression/,
      },
    ];
    return config;
  },
  async headers() {
    const isDev = process.env.NODE_ENV === "development";
    let apiOrigin = "";
    try {
      apiOrigin = process.env.NEXT_PUBLIC_API_URL
        ? new URL(process.env.NEXT_PUBLIC_API_URL).origin
        : "";
    } catch {
      // A malformed API URL will still fail requests, but should not break the build.
    }
    const connectSrc = isDev
      ? `'self' ws://localhost:* wss://localhost:* http://localhost:* https://localhost:* ${apiOrigin} https://rpc.testnet.arc.network https://auth.privy.io https://*.privy.io wss://*.privy.io https://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.com wss://*.walletconnect.org https://public.pimlico.io`
      : `'self' ${apiOrigin} https://rpc.testnet.arc.network https://auth.privy.io https://*.privy.io wss://*.privy.io https://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.com wss://*.walletconnect.org https://public.pimlico.io`;

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "frame-src 'self' https://auth.privy.io https://*.privy.io",
              "media-src 'self' blob: https://d8j0ntlcm91z4.cloudfront.net https://*.cloudfront.net",
              `connect-src ${connectSrc}`,
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
