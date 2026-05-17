import { Router } from "express";
import { db } from "@workspace/db";
import { banksTable, jobsTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res): Promise<void> => {
  try {
    const [bankCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(banksTable)
      .where(eq(banksTable.isActive, true));

    const jobStats = await db
      .select({
        status: jobsTable.status,
        count: sql<number>`count(*)::int`,
        totalFiles: sql<number>`sum(${jobsTable.fileCount})::int`,
      })
      .from(jobsTable)
      .groupBy(jobsTable.status);

    let totalJobs = 0;
    let completedJobs = 0;
    let failedJobs = 0;
    let totalPdfsGenerated = 0;

    for (const row of jobStats) {
      totalJobs += row.count;
      if (row.status === "completed") {
        completedJobs = row.count;
        totalPdfsGenerated = row.totalFiles ?? 0;
      }
      if (row.status === "failed") failedJobs = row.count;
    }

    const recentJobs = await db
      .select()
      .from(jobsTable)
      .orderBy(desc(jobsTable.createdAt))
      .limit(5);

    res.json({
      totalJobs,
      completedJobs,
      failedJobs,
      totalPdfsGenerated,
      totalBanks: bankCount?.count ?? 0,
      recentJobs,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
