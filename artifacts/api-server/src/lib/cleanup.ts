import { db } from "@workspace/db";
import { jobsTable, generatedFilesTable } from "@workspace/db";
import { eq, lt, and, inArray } from "drizzle-orm";
import { logger } from "./logger";

/** How long to keep completed jobs (default: 7 days). */
const RETENTION_COMPLETED_DAYS = Number(process.env.RETENTION_COMPLETED_DAYS) || 7;

/** How long to keep failed jobs (default: 1 day). */
const RETENTION_FAILED_DAYS = Number(process.env.RETENTION_FAILED_DAYS) || 1;

/** Batch size for deletion to avoid large transactions. */
const BATCH_SIZE = 50;

export interface CleanupResult {
  deletedJobs: number;
  deletedFiles: number;
}

/**
 * Delete jobs older than the given number of days.
 * Removes job rows and generated files.
 */
export async function cleanupOlderThan(days: number): Promise<CleanupResult> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  logger.info({ cutoffDate: cutoff.toISOString(), days }, "Running cleanup for jobs older than cutoff");

  let deletedJobs = 0;
  let deletedFiles = 0;

  // Find expired jobs in batches
  while (true) {
    const expiredJobs = await db
      .select({ id: jobsTable.id })
      .from(jobsTable)
      .where(lt(jobsTable.createdAt, cutoff))
      .limit(BATCH_SIZE);

    if (expiredJobs.length === 0) break;

    const jobIds = expiredJobs.map((j) => j.id);

    // Delete generated files for these jobs
    await db
      .delete(generatedFilesTable)
      .where(inArray(generatedFilesTable.jobId, jobIds));

    // Delete the jobs themselves
    await db.delete(jobsTable).where(inArray(jobsTable.id, jobIds));

    deletedJobs += jobIds.length;
    // drizzle doesn't return rowCount easily, estimate from batch
    deletedFiles += jobIds.length; // at least 1 per job

    logger.info({ batch: jobIds.length, totalDeleted: deletedJobs }, "Cleanup batch completed");
  }

  return { deletedJobs, deletedFiles };
}

/**
 * Scheduled cleanup: applies retention policies.
 * - Completed jobs: deleted after RETENTION_COMPLETED_DAYS
 * - Failed jobs: deleted after RETENTION_FAILED_DAYS
 */
export async function runCleanup(): Promise<CleanupResult> {
  const completedCutoff = new Date(Date.now() - RETENTION_COMPLETED_DAYS * 24 * 60 * 60 * 1000);
  const failedCutoff = new Date(Date.now() - RETENTION_FAILED_DAYS * 24 * 60 * 60 * 1000);

  logger.info({
    completedRetentionDays: RETENTION_COMPLETED_DAYS,
    failedRetentionDays: RETENTION_FAILED_DAYS,
  }, "Starting scheduled cleanup");

  let totalDeletedJobs = 0;
  let totalDeletedFiles = 0;

  // 1. Delete old completed jobs
  while (true) {
    const expired = await db
      .select({ id: jobsTable.id })
      .from(jobsTable)
      .where(and(
        eq(jobsTable.status, "completed"),
        lt(jobsTable.createdAt, completedCutoff),
      ))
      .limit(BATCH_SIZE);

    if (expired.length === 0) break;
    const ids = expired.map((j) => j.id);

    await db.delete(generatedFilesTable).where(inArray(generatedFilesTable.jobId, ids));
    await db.delete(jobsTable).where(inArray(jobsTable.id, ids));

    totalDeletedJobs += ids.length;
  }

  // 2. Delete old failed jobs
  while (true) {
    const expired = await db
      .select({ id: jobsTable.id })
      .from(jobsTable)
      .where(and(
        eq(jobsTable.status, "failed"),
        lt(jobsTable.createdAt, failedCutoff),
      ))
      .limit(BATCH_SIZE);

    if (expired.length === 0) break;
    const ids = expired.map((j) => j.id);

    await db.delete(generatedFilesTable).where(inArray(generatedFilesTable.jobId, ids));
    await db.delete(jobsTable).where(inArray(jobsTable.id, ids));

    totalDeletedJobs += ids.length;
  }

  logger.info({
    deletedJobs: totalDeletedJobs,
    completedCutoff: completedCutoff.toISOString(),
    failedCutoff: failedCutoff.toISOString(),
  }, "Scheduled cleanup completed");

  return {
    deletedJobs: totalDeletedJobs,
    deletedFiles: totalDeletedFiles,
  };
}

/**
 * NULL out uploadedFileData for completed jobs to reclaim space.
 * The uploaded Excel is not needed after PDFs are generated successfully.
 */
export async function nullifyProcessedUploads(): Promise<number> {
  let total = 0;

  while (true) {
    const jobs = await db
      .select({ id: jobsTable.id, uploadedFileData: jobsTable.uploadedFileData })
      .from(jobsTable)
      .where(and(
        eq(jobsTable.status, "completed"),
      ))
      .limit(BATCH_SIZE);

    const jobsWithData = jobs.filter(j => j.uploadedFileData !== null);

    if (jobsWithData.length === 0) break;

    const ids = jobsWithData.map((j) => j.id);

    await db
      .update(jobsTable)
      .set({ uploadedFileData: null })
      .where(inArray(jobsTable.id, ids));

    total += ids.length;
  }

  if (total > 0) {
    logger.info({ count: total }, "Nullified uploadedFileData for completed jobs");
  }

  return total;
}