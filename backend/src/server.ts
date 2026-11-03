import { buildApp } from "./app.js";
import { config } from "./config.js";

async function main(): Promise<void> {
  const app = await buildApp();
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`Fabulous Cartz API listening on http://${config.HOST}:${config.PORT}`);
    app.log.info(`OpenAPI UI: http://${config.HOST}:${config.PORT}/docs`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, "Graceful shutdown started");
    try {
      await app.close();
      app.log.info("HTTP server closed");
      process.exit(0);
    } catch (error) {
      app.log.error(error, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
