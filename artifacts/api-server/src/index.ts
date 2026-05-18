import app from "./app";
import { logger } from "./lib/logger";
import { runCleanup, nullifyProcessedUploads } from "./lib/cleanup";

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

  async function runScheduledTasks() {
    try {
      const cleanupResult = await runCleanup();
      logger.info({ result: cleanupResult }, "Scheduled cleanup completed");

      const nullifiedCount = await nullifyProcessedUploads();
      if (nullifiedCount > 0) {
        logger.info({ count: nullifiedCount }, "Nullified uploaded files");
      }
    } catch (e) {
      logger.warn({ e }, "Scheduled tasks failed");
    }
  }

  runScheduledTasks().catch((e) => logger.warn({ e }, "Startup tasks failed"));
  setInterval(runScheduledTasks, 6 * 60 * 60 * 1000);
});
