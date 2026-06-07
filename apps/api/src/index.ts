import "./types.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { registerRoutes } from "./routes/index.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.CORS_ORIGIN ?? true,
  credentials: true,
});

await registerRoutes(app);

app.listen({ port: config.port, host: "0.0.0.0" }, (err, addr) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`ArcRemit API listening at ${addr}`);
});
