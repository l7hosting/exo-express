import "dotenv/config";
import { buildServer } from "./app.js";
import { config, assertRuntimeConfig } from "./lib/config.js";
import { prisma } from "./lib/prisma.js";

const SHUTDOWN_TIMEOUT_MS = 15_000;

assertRuntimeConfig();

const app = await buildServer();
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  app.log.info({ signal }, "shutting down");
  // Hard stop so an open connection cannot keep a container alive forever.
  const forceExit = setTimeout(() => {
    app.log.error("graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    await app.close();
    await prisma.$disconnect();
    clearTimeout(forceExit);
    app.log.info("shutdown complete");
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, "shutdown failed");
    clearTimeout(forceExit);
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error({ err: error }, "unable to start server");
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
}
