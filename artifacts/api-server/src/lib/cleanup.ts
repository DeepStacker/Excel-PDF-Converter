import { logger } from "./logger";

/**
 * Files are now stored in the database, no filesystem cleanup needed.
 * Temp files used during processing are cleaned up after each job.
 */
export async function cleanOrphanedUploads(): Promise<void> {
  logger.debug("Skipping upload cleanup - files stored in DB");
}

export async function cleanOrphanedOutputDirs(): Promise<void> {
  logger.debug("Skipping output cleanup - files stored in DB");
}

export async function runCleanup(): Promise<void> {
  logger.debug("Skipping cleanup - files stored in DB");
}