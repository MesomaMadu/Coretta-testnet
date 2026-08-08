import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, "../.."),
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      // Avoid @wagmi/connectors barrel (pulls optional coinbase/metamask/porto deps).
      "@wagmi/connectors/walletConnect": path.join(
        __dirname,
        "node_modules/@wagmi/connectors/dist/esm/walletConnect.js",
      ),
    };
    return config;
  },
  async headers() {
    const isDev = process.env.NODE_ENV === "development";
    const connectSrc = isDev
      ? "'self' ws://localhost:* wss://localhost:* http://localhost:* https://localhost:* https://rpc.testnet.arc.network https://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.com wss://*.walletconnect.org https://public.pimlico.io"
      : "'self' https://rpc.testnet.arc.network https://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.com wss://*.walletconnect.org https://public.pimlico.io";

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
              // Hero/use-case videos load from CloudFront (default-src 'self' would block them).
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
