import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import JSZip from "jszip";
import { db } from "@workspace/db";
import { jobsTable, generatedFilesTable, banksTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import {
  CreateJobBody,
  GetJobParams,
  DeleteJobParams,
  RetryJobParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { generatePdf, type PdfConfig } from "../lib/pdfGenerator";

const router = Router();

// Temp directory for processing (files are read from DB, written to temp, cleaned up)
const TEMP_DIR = path.join(process.env.TMPDIR || "/tmp", "pdf-generator");
fs.mkdirSync(TEMP_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".xlsx", ".xls"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel files (.xlsx, .xls) are allowed"));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
});

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JOB_TIMEOUT_MS = 8 * 60 * 1000; // 8 minutes

// ── Concurrency semaphore: max 2 simultaneous processes ──
const MAX_CONCURRENT = 2;
let activeProcesses = 0;
const waitQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeProcesses < MAX_CONCURRENT) {
    activeProcesses++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waitQueue.push(() => { activeProcesses++; resolve(); });
  });
}

function releaseSlot(): void {
  activeProcesses--;
  const next = waitQueue.shift();
  if (next) next();
}

type PdfResult = {
  success: boolean;
  files?: Array<{
    filename: string;
    branchCode: string;
    branchName: string;
    rowCount: number;
    fileSize: number;
  }>;
  error?: string;
};

function runPdfGenerator(
  excelPath: string,
  outputDir: string,
  auditType: string,
  config: object
): Promise<PdfResult> {
  const timeoutPromise = new Promise<PdfResult>((_, reject) => {
    setTimeout(() => reject(new Error(`PDF generation timed out after ${JOB_TIMEOUT_MS / 60000} minutes`)), JOB_TIMEOUT_MS);
  });

  return Promise.race([
    generatePdf(excelPath, outputDir, auditType, config as unknown as PdfConfig),
    timeoutPromise
  ]).catch((err) => ({ success: false, error: err.message }));
}

async function processJob(jobId: number, excelBuffer: Buffer, bank: { columnMapping: unknown; pdfStyle: unknown }, auditType: string) {
  const tempInput = path.join(TEMP_DIR, `input_${jobId}.xlsx`);
  const outputDir = path.join(TEMP_DIR, `output_${jobId}`);

  await acquireSlot();
  try {
    await db.update(jobsTable).set({ status: "processing" }).where(eq(jobsTable.id, jobId));

    fs.writeFileSync(tempInput, excelBuffer);
    fs.mkdirSync(outputDir, { recursive: true });

    const config = {
      columnMapping: bank.columnMapping,
      pdfStyle: bank.pdfStyle ?? {},
    };

    const result = await runPdfGenerator(tempInput, outputDir, auditType, config);

    if (!result.success) {
      await db.update(jobsTable)
        .set({ status: "failed", errorMessage: result.error ?? "Unknown error" })
        .where(eq(jobsTable.id, jobId));
      return;
    }

    const files = result.files ?? [];
    if (files.length > 0) {
      const fileRecords = await Promise.all(
        files.map(async (f) => {
          const filePath = path.join(outputDir, f.filename);
          const fileData = fs.readFileSync(filePath);
          return {
            jobId,
            filename: f.filename,
            branchCode: f.branchCode,
            branchName: f.branchName,
            rowCount: f.rowCount,
            fileSize: f.fileSize ?? fileData.length,
            fileData: fileData.toString("base64"),
          };
        })
      );
      await db.insert(generatedFilesTable).values(fileRecords);
    }

    await db.update(jobsTable)
      .set({ status: "completed", fileCount: files.length })
      .where(eq(jobsTable.id, jobId));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, jobId }, "Job processing error");
    await db.update(jobsTable)
      .set({ status: "failed", errorMessage: msg })
      .where(eq(jobsTable.id, jobId));
  } finally {
    releaseSlot();
    // Clean up temp files
    try {
      if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
      if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true });
    } catch { /* ignore cleanup errors */ }
  }
}

// ── List jobs ──
router.get("/", async (req, res): Promise<void> => {
  try {
    const jobs = await db.select().from(jobsTable).orderBy(desc(jobsTable.createdAt)).limit(200);
    res.json(jobs);
  } catch (err) {
    req.log.error({ err }, "Failed to list jobs");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Create job ──
router.post(
  "/",
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        // multer errors (file type, size limit, etc.)
        res.status(400).json({ error: err.message });
        return;
      }
      next();
    });
  },
  async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const parsed = CreateJobBody.safeParse({
    bankId: Number(req.body.bankId),
    auditType: req.body.auditType,
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request: bankId and auditType are required" });
    return;
  }

  const { bankId, auditType } = parsed.data;

  // Sanitize auditType: must be alphanumeric + underscores only (defense in depth)
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(auditType)) {
    res.status(400).json({ error: "Invalid audit type format" });
    return;
  }

  try {
    const [bank] = await db.select().from(banksTable).where(eq(banksTable.id, bankId));
    if (!bank) {
      res.status(404).json({ error: "Bank configuration not found" });
      return;
    }
    if (!bank.isActive) {
      res.status(400).json({ error: "This bank configuration is inactive" });
      return;
    }

    // Validate audit type exists in bank config
    const auditTypes = (bank.auditTypes as Array<{ code: string }>) ?? [];
    const validAuditType = auditTypes.some((t) => t.code === auditType);
    if (!validAuditType) {
      res.status(400).json({
        error: `Invalid audit type "${auditType}". Valid types: ${auditTypes.map(t => t.code).join(", ")}`,
      });
      return;
    }

    const [job] = await db.insert(jobsTable).values({
      bankId,
      bankName: bank.name,
      auditType,
      status: "pending",
      originalFilename: req.file.originalname,
      uploadedFileData: req.file.buffer.toString("base64"),
      fileCount: 0,
    }).returning();

    res.status(201).json(job);

    // Process in background (non-blocking) - pass buffer instead of path
    processJob(job.id, req.file.buffer, bank, auditType).catch((err) => {
      logger.error({ err, jobId: job.id }, "Unhandled job processing error");
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create job");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Get job detail ──
router.get("/:id", async (req, res): Promise<void> => {
  const parsed = GetJobParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, parsed.data.id));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    const files = await db.select().from(generatedFilesTable)
      .where(eq(generatedFilesTable.jobId, job.id));

    const baseUrl = `/api/jobs/${job.id}`;
    const enrichedFiles = files.map((f) => ({
      ...f,
      fileData: undefined,
      downloadUrl: `${baseUrl}/files/${encodeURIComponent(f.filename)}`,
    }));

    res.json({
      ...job,
      uploadedFileData: undefined,
      files: enrichedFiles,
      downloadAllUrl: files.length > 0 ? `${baseUrl}/download-all` : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get job");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Delete job ──
router.delete("/:id", async (req, res): Promise<void> => {
  const parsed = DeleteJobParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, parsed.data.id));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    await db.delete(generatedFilesTable).where(eq(generatedFilesTable.jobId, job.id));
    await db.delete(jobsTable).where(eq(jobsTable.id, job.id));

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete job");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Retry job ──
router.post("/:id/retry", async (req, res): Promise<void> => {
  const parsed = RetryJobParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, parsed.data.id));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    if (!job.uploadedFileData) {
      res.status(400).json({ error: "Original file is no longer available for retry" });
      return;
    }
    if (job.status === "processing") {
      res.status(400).json({ error: "Job is already processing" });
      return;
    }

    const [bank] = await db.select().from(banksTable).where(eq(banksTable.id, job.bankId));
    if (!bank) { res.status(404).json({ error: "Bank configuration not found" }); return; }

    await db.delete(generatedFilesTable).where(eq(generatedFilesTable.jobId, job.id));

    const [updatedJob] = await db.update(jobsTable)
      .set({ status: "pending", errorMessage: null, fileCount: 0 })
      .where(eq(jobsTable.id, job.id))
      .returning();

    res.json(updatedJob);

    if (!job.uploadedFileData) {
      logger.error({ jobId: job.id }, "No uploaded file data found for retry");
      return;
    }

    processJob(job.id, Buffer.from(job.uploadedFileData, "base64"), bank, job.auditType).catch((err) => {
      logger.error({ err, jobId: job.id }, "Unhandled retry error");
    });
  } catch (err) {
    req.log.error({ err }, "Failed to retry job");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Download / view single file ──
// Use ?download=1 to force attachment (download), default is inline (view in browser)
router.get("/:id/files/:filename", async (req, res): Promise<void> => {
  const jobId = Number(req.params.id);
  const filename = req.params.filename;
  if (isNaN(jobId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [file] = await db
      .select()
      .from(generatedFilesTable)
      .where(and(
        eq(generatedFilesTable.jobId, jobId),
        eq(generatedFilesTable.filename, filename),
      ));

    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    if (!file.fileData) {
      res.status(404).json({ error: "File data not found" });
      return;
    }

    const forceDownload = req.query.download === "1";
    const disposition = forceDownload ? "attachment" : "inline";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${encodeURIComponent(filename)}"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(Buffer.from(file.fileData, "base64"));
  } catch (err) {
    req.log.error({ err }, "Failed to download file");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Download all as ZIP ──
router.get("/:id/download-all", async (req, res): Promise<void> => {
  const jobId = Number(req.params.id);
  if (isNaN(jobId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    const files = await db.select().from(generatedFilesTable).where(eq(generatedFilesTable.jobId, jobId));
    if (files.length === 0) {
      res.status(404).json({ error: "No output files found" });
      return;
    }

    const zip = new JSZip();
    for (const file of files) {
      if (file.fileData) {
        zip.file(file.filename, Buffer.from(file.fileData, "base64"));
      }
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });

    const safeName = `${job.bankName}_${job.auditType}_${jobId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.zip"`);
    res.setHeader("Content-Length", zipBuffer.length);
    res.send(zipBuffer);
  } catch (err) {
    req.log.error({ err }, "Failed to download all");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
