import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { createRequire } from "module";
import type { Archiver as ArchiverInstance } from "archiver";
const _require = createRequire(import.meta.url);
const archiver = _require("archiver") as (format: string, options?: object) => ArchiverInstance;
import { db } from "@workspace/db";
import { jobsTable, generatedFilesTable, banksTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  CreateJobBody,
  GetJobParams,
  DeleteJobParams,
  RetryJobParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router = Router();

// Anchor paths to the source file location so they work regardless of cwd
// Compiled output lives at dist/index.mjs → one level up is the package root
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UPLOADS_DIR = path.join(PKG_ROOT, "uploads");
const OUTPUTS_DIR = path.join(PKG_ROOT, "outputs");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${unique}-${safeName}`);
  },
});

const upload = multer({
  storage,
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

const PYTHON_SCRIPT = path.join(PKG_ROOT, "scripts", "pdf_generator.py");
const JOB_TIMEOUT_MS = 8 * 60 * 1000; // 8 minutes

// ── Concurrency semaphore: max 2 simultaneous Python processes ──
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
  return new Promise((resolve) => {
    const configJson = JSON.stringify(config);
    const proc = spawn("python3", [PYTHON_SCRIPT, excelPath, outputDir, auditType, configJson]);
    let stdout = "";
    let stderr = "";

    const killTimeout = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve({ success: false, error: `PDF generation timed out after ${JOB_TIMEOUT_MS / 60000} minutes` });
    }, JOB_TIMEOUT_MS);

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      clearTimeout(killTimeout);
      if (stderr) logger.warn({ stderr: stderr.slice(0, 2000) }, "PDF generator stderr");
      if (code !== 0) {
        resolve({ success: false, error: stderr.slice(0, 500) || "Python process failed" });
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch {
        resolve({ success: false, error: `Failed to parse output: ${stdout.slice(0, 200)}` });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(killTimeout);
      resolve({ success: false, error: err.message });
    });
  });
}

async function processJob(jobId: number, excelPath: string, bank: { columnMapping: unknown; pdfStyle: unknown }, auditType: string) {
  const outputDir = path.join(OUTPUTS_DIR, String(jobId));
  fs.mkdirSync(outputDir, { recursive: true });

  await acquireSlot();
  try {
    await db.update(jobsTable).set({ status: "processing", outputDir }).where(eq(jobsTable.id, jobId));

    const config = {
      columnMapping: bank.columnMapping,
      pdfStyle: bank.pdfStyle ?? {},
    };

    const result = await runPdfGenerator(excelPath, outputDir, auditType, config);

    if (!result.success) {
      await db.update(jobsTable)
        .set({ status: "failed", errorMessage: result.error ?? "Unknown error" })
        .where(eq(jobsTable.id, jobId));
      return;
    }

    const files = result.files ?? [];
    if (files.length > 0) {
      await db.insert(generatedFilesTable).values(
        files.map((f) => ({
          jobId,
          filename: f.filename,
          branchCode: f.branchCode,
          branchName: f.branchName,
          rowCount: f.rowCount,
          fileSize: f.fileSize ?? null,
        }))
      );
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
      uploadedFilePath: req.file.path,
      fileCount: 0,
    }).returning();

    res.status(201).json(job);

    // Process in background (non-blocking)
    processJob(job.id, req.file.path, bank, auditType).catch((err) => {
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
      downloadUrl: `${baseUrl}/files/${encodeURIComponent(f.filename)}`,
    }));

    res.json({
      ...job,
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

    if (job.uploadedFilePath && fs.existsSync(job.uploadedFilePath)) {
      try { fs.unlinkSync(job.uploadedFilePath); } catch { /* ignore */ }
    }
    const outputDir = path.join(OUTPUTS_DIR, String(job.id));
    if (fs.existsSync(outputDir)) {
      try { fs.rmSync(outputDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }

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
    if (!job.uploadedFilePath || !fs.existsSync(job.uploadedFilePath)) {
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
    const outputDir = path.join(OUTPUTS_DIR, String(job.id));
    if (fs.existsSync(outputDir)) {
      try { fs.rmSync(outputDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }

    const [updatedJob] = await db.update(jobsTable)
      .set({ status: "pending", errorMessage: null, fileCount: 0 })
      .where(eq(jobsTable.id, job.id))
      .returning();

    res.json(updatedJob);

    processJob(job.id, job.uploadedFilePath, bank, job.auditType).catch((err) => {
      logger.error({ err, jobId: job.id }, "Unhandled retry error");
    });
  } catch (err) {
    req.log.error({ err }, "Failed to retry job");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Download single file ──
router.get("/:id/files/:filename", async (req, res): Promise<void> => {
  const jobId = Number(req.params.id);
  const filename = req.params.filename;
  if (isNaN(jobId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const outputDir = path.join(OUTPUTS_DIR, String(jobId));
  const filePath = path.resolve(outputDir, filename);

  // Security: path traversal protection
  if (!filePath.startsWith(path.resolve(outputDir))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  res.download(filePath, filename);
});

// ── Download all as ZIP ──
router.get("/:id/download-all", async (req, res): Promise<void> => {
  const jobId = Number(req.params.id);
  if (isNaN(jobId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    const outputDir = path.join(OUTPUTS_DIR, String(jobId));
    if (!fs.existsSync(outputDir)) {
      res.status(404).json({ error: "No output files found" });
      return;
    }

    const safeName = `${job.bankName}_${job.auditType}_${jobId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.zip"`);

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", (err: Error) => {
      req.log.error({ err }, "Archive error");
      if (!res.headersSent) res.status(500).end();
    });
    archive.pipe(res);
    archive.directory(outputDir, false);
    archive.finalize();
  } catch (err) {
    req.log.error({ err }, "Failed to download all");
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
