import app from "./app";
import { logger } from "./lib/logger";
import { runCleanup } from "./lib/cleanup";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Run cleanup on startup, then every 6 hours
  runCleanup().catch((e) => logger.warn({ e }, "Startup cleanup failed"));
  setInterval(() => {
    runCleanup().catch((e) => logger.warn({ e }, "Scheduled cleanup failed"));
  }, 6 * 60 * 60 * 1000);
});
