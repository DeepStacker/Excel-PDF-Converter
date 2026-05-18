import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "@workspace/db";
import { jobsTable } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";
import { logger } from "./logger";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UPLOADS_DIR = path.join(PKG_ROOT, "uploads");
const OUTPUTS_DIR = path.join(PKG_ROOT, "outputs");

/**
 * Remove orphaned upload files that are no longer referenced by any job row.
 * Runs periodically (called from the server startup) — safe to run at any time.
 */
export async function cleanOrphanedUploads(): Promise<void> {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) return;

    const files = fs.readdirSync(UPLOADS_DIR);
    if (files.length === 0) return;

    const filePaths = files.map((f) => path.join(UPLOADS_DIR, f));

    // Find which paths are still referenced in the DB
    const rows = await db
      .select({ path: jobsTable.uploadedFilePath })
      .from(jobsTable)
      .where(sql`${jobsTable.uploadedFilePath} IS NOT NULL`);

    const referenced = new Set(rows.map((r) => r.path).filter(Boolean));

    let removed = 0;
    for (const filePath of filePaths) {
      if (!referenced.has(filePath)) {
        try {
          fs.unlinkSync(filePath);
          removed++;
        } catch { /* ignore */ }
      }
    }

    if (removed > 0) {
      logger.info({ removed }, "Cleaned orphaned upload files");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to clean orphaned uploads");
  }
}

/**
 * Remove output directories for jobs that were deleted from the DB.
 */
export async function cleanOrphanedOutputDirs(): Promise<void> {
  try {
    if (!fs.existsSync(OUTPUTS_DIR)) return;

    const dirs = fs.readdirSync(OUTPUTS_DIR);
    if (dirs.length === 0) return;

    const jobIds = dirs.map(Number).filter((n) => !isNaN(n));
    if (jobIds.length === 0) return;

    const existingJobs = await db
      .select({ id: jobsTable.id })
      .from(jobsTable)
      .where(inArray(jobsTable.id, jobIds));

    const existingIds = new Set(existingJobs.map((j) => j.id));

    let removed = 0;
    for (const id of jobIds) {
      if (!existingIds.has(id)) {
        const dir = path.join(OUTPUTS_DIR, String(id));
        try {
          fs.rmSync(dir, { recursive: true, force: true });
          removed++;
        } catch { /* ignore */ }
      }
    }

    if (removed > 0) {
      logger.info({ removed }, "Cleaned orphaned output directories");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to clean orphaned output dirs");
  }
}

/** Run all cleanup tasks — called once at server startup and then on a timer. */
export async function runCleanup(): Promise<void> {
  await Promise.all([cleanOrphanedUploads(), cleanOrphanedOutputDirs()]);
}
