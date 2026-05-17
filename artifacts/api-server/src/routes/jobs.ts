import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const archiver = _require("archiver") as (format: string, options?: object) => archiver.Archiver;
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

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const OUTPUTS_DIR = path.join(process.cwd(), "outputs");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${file.originalname}`);
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
  limits: { fileSize: 50 * 1024 * 1024 },
});

const PYTHON_SCRIPT = path.join(process.cwd(), "scripts", "pdf_generator.py");

function runPdfGenerator(
  excelPath: string,
  outputDir: string,
  auditType: string,
  config: object
): Promise<{ success: boolean; files?: Array<{ filename: string; branchCode: string; branchName: string; rowCount: number; fileSize: number }>; error?: string }> {
  return new Promise((resolve) => {
    const configJson = JSON.stringify(config);
    const proc = spawn("python3", [PYTHON_SCRIPT, excelPath, outputDir, auditType, configJson]);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (stderr) logger.warn({ stderr }, "PDF generator stderr");
      if (code !== 0) {
        resolve({ success: false, error: stderr || "Python process failed" });
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        resolve({ success: false, error: `Failed to parse output: ${stdout}` });
      }
    });
    proc.on("error", (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

async function processJob(jobId: number, excelPath: string, bank: any, auditType: string) {
  const outputDir = path.join(OUTPUTS_DIR, String(jobId));
  fs.mkdirSync(outputDir, { recursive: true });

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
  } catch (err: any) {
    logger.error({ err, jobId }, "Job processing error");
    await db.update(jobsTable)
      .set({ status: "failed", errorMessage: err?.message ?? "Unknown error" })
      .where(eq(jobsTable.id, jobId));
  }
}

router.get("/", async (req, res): Promise<void> => {
  try {
    const jobs = await db.select().from(jobsTable).orderBy(desc(jobsTable.createdAt));
    res.json(jobs);
  } catch (err) {
    req.log.error({ err }, "Failed to list jobs");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const parsed = CreateJobBody.safeParse({
    bankId: Number(req.body.bankId),
    auditType: req.body.auditType,
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { bankId, auditType } = parsed.data;

  try {
    const [bank] = await db.select().from(banksTable).where(eq(banksTable.id, bankId));
    if (!bank) {
      res.status(404).json({ error: "Bank not found" });
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

router.get("/:id", async (req, res): Promise<void> => {
  const parsed = GetJobParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, parsed.data.id));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    const files = await db.select().from(generatedFilesTable).where(eq(generatedFilesTable.jobId, job.id));

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

router.delete("/:id", async (req, res): Promise<void> => {
  const parsed = DeleteJobParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, parsed.data.id));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    await db.delete(generatedFilesTable).where(eq(generatedFilesTable.jobId, job.id));
    await db.delete(jobsTable).where(eq(jobsTable.id, job.id));

    // Clean up files
    if (job.uploadedFilePath && fs.existsSync(job.uploadedFilePath)) {
      fs.unlinkSync(job.uploadedFilePath);
    }
    const outputDir = path.join(OUTPUTS_DIR, String(job.id));
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete job");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/retry", async (req, res): Promise<void> => {
  const parsed = RetryJobParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, parsed.data.id));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    if (!job.uploadedFilePath || !fs.existsSync(job.uploadedFilePath)) {
      res.status(400).json({ error: "Original file no longer available" });
      return;
    }

    const [bank] = await db.select().from(banksTable).where(eq(banksTable.id, job.bankId));
    if (!bank) { res.status(404).json({ error: "Bank not found" }); return; }

    // Clear old generated files
    await db.delete(generatedFilesTable).where(eq(generatedFilesTable.jobId, job.id));
    const outputDir = path.join(OUTPUTS_DIR, String(job.id));
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
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

router.get("/:id/files/:filename", async (req, res): Promise<void> => {
  const jobId = Number(req.params.id);
  const filename = req.params.filename;
  if (isNaN(jobId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const outputDir = path.join(OUTPUTS_DIR, String(jobId));
  const filePath = path.join(outputDir, filename);

  // Security: ensure the file is inside the expected output dir
  if (!filePath.startsWith(outputDir)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  res.download(filePath, filename);
});

router.get("/:id/download-all", async (req, res): Promise<void> => {
  const jobId = Number(req.params.id);
  if (isNaN(jobId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }

  const outputDir = path.join(OUTPUTS_DIR, String(jobId));
  if (!fs.existsSync(outputDir)) {
    res.status(404).json({ error: "Output directory not found" });
    return;
  }

  const zipFilename = `${job.bankName}_${job.auditType}_${jobId}.zip`;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${zipFilename}"`);

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => {
    req.log.error({ err }, "Archive error");
    res.status(500).end();
  });
  archive.pipe(res);
  archive.directory(outputDir, false);
  archive.finalize();
});

export default router;
