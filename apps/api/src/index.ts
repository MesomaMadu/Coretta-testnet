import "./types.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { registerRoutes } from "./routes/index.js";
import { log } from "./lib/log.js";
import { resetAndDeployAllCircleScas } from "./services/wallet.js";

const app = Fastify({ logger: true });

function resolveCorsOrigin(): boolean | string | string[] | RegExp {
  const raw = config.corsOrigin;
  if (!raw || raw === "*" || raw === "true") {
    // Reflect request origin in development; lock down via CORS_ORIGIN in production.
    return true;
  }
  if (raw.includes(",")) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return raw;
}

await app.register(cors, {
  origin: resolveCorsOrigin(),
  credentials: true,
});

app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req, reply) => {
  log.error("api", err.message ?? "Unhandled error", {
    url: req.url,
    method: req.method,
    code: err.code,
  });
  const status = err.statusCode ?? 500;
  reply.code(status).send({
    code: err.code ?? "INTERNAL_ERROR",
    message: status >= 500 ? "Internal server error" : err.message,
  });
});

await registerRoutes(app);

app.listen({ port: config.port, host: "0.0.0.0" }, (err, addr) => {
  if (err) {
    log.error("api", "Failed to start server", { message: err.message });
    process.exit(1);
  }
  log.info("api", `Coretta API listening at ${addr}`, {
    devMode: config.devMode,
    hasKitKey: Boolean(config.kitKey),
    hasCircle: Boolean(config.circleApiKey),
  });

  // Full reset of Circle SCA deploy flags, then deploy all existing SCAs on-chain.
  // Requires funded SCAs (USDC gas on Arc). Failures are logged; wallets stay usable once funded.
  if (config.circleApiKey && config.circleEntitySecret && config.circleWalletSetId) {
    void resetAndDeployAllCircleScas()
      .then((summary) => {
        log.info("api", "Circle SCA reset+deploy finished", {
          total: summary.total,
          deployed: summary.deployed,
          failed: summary.failed,
        });
      })
      .catch((e) => {
        log.error("api", "Circle SCA reset+deploy failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      });
  }
});
