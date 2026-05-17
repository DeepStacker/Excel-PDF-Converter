import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { shareTokensTable, jobsTable, generatedFilesTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import {
  CreateShareLinkParams,
  CreateShareLinkBody,
  GetSharedJobParams,
} from "@workspace/api-zod";

const router = Router();

function getShareUrl(req: any, token: string): string {
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
  const proto = req.headers["x-forwarded-proto"] ?? "https";
  return `${proto}://${host}/share/${token}`;
}

router.post("/jobs/:id/share", async (req, res): Promise<void> => {
  const paramsParsed = CreateShareLinkParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const bodyParsed = CreateShareLinkBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: bodyParsed.error.message }); return; }

  const { id } = paramsParsed.data;
  const expiresInHours = bodyParsed.data?.expiresInHours ?? null;

  try {
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    if (job.status !== "completed") {
      res.status(400).json({ error: "Only completed jobs can be shared" });
      return;
    }

    const token = randomUUID().replace(/-/g, "");
    const expiresAt = expiresInHours
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      : null;

    const [shareToken] = await db
      .insert(shareTokensTable)
      .values({ jobId: id, token, expiresAt })
      .returning();

    res.status(201).json({
      id: shareToken.id,
      jobId: shareToken.jobId,
      token: shareToken.token,
      shareUrl: getShareUrl(req, shareToken.token),
      expiresAt: shareToken.expiresAt?.toISOString() ?? null,
      createdAt: shareToken.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create share link");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/share/:token", async (req, res): Promise<void> => {
  const parsed = GetSharedJobParams.safeParse({ token: req.params.token });
  if (!parsed.success) { res.status(400).json({ error: "Invalid token" }); return; }

  const { token } = parsed.data;

  try {
    const now = new Date();
    const [shareToken] = await db
      .select()
      .from(shareTokensTable)
      .where(eq(shareTokensTable.token, token));

    if (!shareToken) { res.status(404).json({ error: "Share link not found" }); return; }
    if (shareToken.expiresAt && shareToken.expiresAt < now) {
      res.status(404).json({ error: "Share link has expired" });
      return;
    }

    const [job] = await db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.id, shareToken.jobId));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    const files = await db
      .select()
      .from(generatedFilesTable)
      .where(eq(generatedFilesTable.jobId, job.id));

    const baseUrl = `/api/jobs/${job.id}`;
    const enrichedFiles = files.map((f) => ({
      ...f,
      downloadUrl: `${baseUrl}/files/${encodeURIComponent(f.filename)}`,
    }));

    res.json({
      jobId: job.id,
      bankName: job.bankName,
      auditType: job.auditType,
      originalFilename: job.originalFilename,
      fileCount: job.fileCount,
      expiresAt: shareToken.expiresAt?.toISOString() ?? null,
      files: enrichedFiles,
      downloadAllUrl: files.length > 0 ? `${baseUrl}/download-all` : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get shared job");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
