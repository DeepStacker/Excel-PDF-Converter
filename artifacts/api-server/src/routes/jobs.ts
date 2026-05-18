import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import JSZip from "jszip";
import { db } from "@workspace/db";
import { jobsTable, generatedFilesTable, banksTable } from "@workspace/db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import {
  CreateJobBody,
  GetJobParams,
  DeleteJobParams,
  RetryJobParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { generatePdf, type PdfConfig } from "../lib/pdfGenerator";
import { runCleanup, cleanupOlderThan } from "../lib/cleanup";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".xlsx" || ext === ".xls") {
      cb(null, true);
    } else {
      cb(new Error("Only Excel files are allowed"));
    }
  },
});

// ── Retention config (for display in API responses) ──
const RETENTION_COMPLETED_DAYS = Number(process.env.RETENTION_COMPLETED_DAYS) || 7;

// Temp directory for processing (files are read from DB, written to temp, cleaned up)
const TEMP_DIR = path.join(process.env.TMPDIR || "/tmp", "pdf-generator");
fs.mkdirSync(TEMP_DIR, { recursive: true });

// ── Validate Excel file against bank config ──
router.post("/validate", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const bankId = Number(req.body.bankId);
  const auditType = req.body.auditType as string;

  if (!bankId || !auditType) {
    res.status(400).json({ error: "bankId and auditType are required" });
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

    const auditTypes = (bank.auditTypes as Array<{ code: string }>) ?? [];
    const validAuditType = auditTypes.some((t) => t.code === auditType);
    if (!validAuditType) {
      res.status(400).json({ error: `Invalid audit type "${auditType}". Valid types: ${auditTypes.map(t => t.code).join(", ")}` });
      return;
    }

// Read Excel headers from uploaded file - search all sheets for columns
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });

    const columnMapping = bank.columnMapping as {
      branchGroupBy: string;
      branchNameCol: string;
      stateCol: string;
      columns: Array<{ header: string; excelColumn: string | null }>;
    };

    const requiredCols = [
      columnMapping.branchGroupBy,
      columnMapping.branchNameCol,
      columnMapping.stateCol,
      ...columnMapping.columns.filter(c => c.excelColumn).map(c => c.excelColumn),
    ].filter(Boolean);

    const normalizedRequired = requiredCols.map(c => c!.toLowerCase());

    let allHeaders: string[] = [];
    let sheetName = "";

    for (const name of workbook.SheetNames) {
      const worksheet = workbook.Sheets[name];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
      if (data.length > 0) {
        const headers = (data[0] || []).map(h => String(h || "").trim());
        const normalizedHeaders = headers.map(h => h.toLowerCase());
        const hasRequired = normalizedRequired.filter(req => normalizedHeaders.includes(req));
        if (hasRequired.length > allHeaders.length) {
          allHeaders = headers;
          sheetName = name;
        }
      }
    }

    if (allHeaders.length === 0) {
      res.json({
        valid: false,
        message: "No columns found in any sheet",
        missing: requiredCols,
        found: [],
      });
      return;
    }

    const headerSet = new Set(allHeaders.map(h => h.toLowerCase()));

    const missing: string[] = [];
    const found: string[] = [];

    // Check branch grouping column
    if (!headerSet.has(columnMapping.branchGroupBy.toLowerCase())) {
      missing.push(columnMapping.branchGroupBy);
    } else {
      found.push(columnMapping.branchGroupBy);
    }

    // Check branch name column
    if (columnMapping.branchNameCol && !headerSet.has(columnMapping.branchNameCol.toLowerCase())) {
      missing.push(columnMapping.branchNameCol);
    } else if (columnMapping.branchNameCol) {
      found.push(columnMapping.branchNameCol);
    }

    // Check required data columns
    for (const col of columnMapping.columns) {
      if (col.excelColumn && !headerSet.has(col.excelColumn.toLowerCase())) {
        missing.push(col.excelColumn);
      } else if (col.excelColumn) {
        found.push(col.excelColumn);
      }
    }

    // Check for blank (hand-fill) columns - they don't need data
    const blankCols = columnMapping.columns.filter(c => c.excelColumn === null);

    const response = {
      valid: missing.length === 0,
      message: missing.length === 0
        ? `All required columns found in sheet "${sheetName}"`
        : `Missing ${missing.length} required column(s)`,
      missing,
      found,
      fileRows: 0,
      fileColumns: allHeaders.length,
      sheetName,
    };

    if (missing.length === 0) {
      for (const name of workbook.SheetNames) {
        const worksheet = workbook.Sheets[name];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
        if (data.length > 1) {
          response.fileRows = Math.max(response.fileRows, data.length - 1);
        }
      }
    }

    res.json(response);
  } catch (err) {
    req.log.error({ err }, "Validation error");
    res.status(500).json({ error: "Failed to validate Excel file" });
  }
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
  config: object,
  onProgress?: (progress: { processed: number; total: number; currentFile: string }) => void
): Promise<PdfResult> {
  const timeoutPromise = new Promise<PdfResult>((_, reject) => {
    setTimeout(() => reject(new Error(`PDF generation timed out after ${JOB_TIMEOUT_MS / 60000} minutes`)), JOB_TIMEOUT_MS);
  });

  return Promise.race([
    generatePdf(excelPath, outputDir, auditType, config as unknown as PdfConfig, onProgress),
    timeoutPromise
  ]).catch((err) => ({ success: false, error: err.message }));
}

async function processJob(jobId: number, excelBuffer: Buffer, bank: { columnMapping: unknown; pdfStyle: unknown }, auditType: string) {
  const tempInput = path.join(TEMP_DIR, `input_${jobId}.xlsx`);
  const outputDir = path.join(TEMP_DIR, `output_${jobId}`);
  const startTime = Date.now();
  let totalFiles = 0;

  await acquireSlot();
  try {
    logger.info({ jobId }, "Starting job processing");
    await db.update(jobsTable).set({ status: "processing", processedFiles: 0 }).where(eq(jobsTable.id, jobId));

    fs.writeFileSync(tempInput, excelBuffer);
    fs.mkdirSync(outputDir, { recursive: true });

    const config = {
      columnMapping: bank.columnMapping,
      pdfStyle: bank.pdfStyle ?? {},
    };

    const updateProgress = async (progress: { processed: number; total: number; currentFile: string }) => {
      totalFiles = progress.total;
      logger.info({ jobId, processed: progress.processed, total: progress.total, file: progress.currentFile }, "Updating progress");
      try {
        await db.update(jobsTable)
          .set({ processedFiles: progress.processed, currentFile: progress.currentFile })
          .where(eq(jobsTable.id, jobId));
      } catch (err) {
        logger.error({ jobId, err }, "Failed to update progress");
      }
    };

    logger.debug({ jobId, auditType }, "Launching PDF generation");
    const result = await runPdfGenerator(tempInput, outputDir, auditType, config, updateProgress);

    if (!result.success) {
      logger.error({ jobId, error: result.error }, "PDF generation failed");
      await db.update(jobsTable)
        .set({ status: "failed", errorMessage: result.error ?? "Unknown error" })
        .where(eq(jobsTable.id, jobId));
      return;
    }

    const files = result.files ?? [];
    if (files.length > 0) {
      logger.info({ jobId, fileCount: files.length }, "Saving generated files to database");
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

    const durationMs = Date.now() - startTime;
    logger.info({ jobId, fileCount: files.length, durationMs }, "Job completed successfully");

    await db.update(jobsTable)
      .set({ status: "completed", fileCount: files.length, uploadedFileData: null })
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

// ── Get cleanup/retention info ──
router.get("/cleanup/info", async (_req, res): Promise<void> => {
  res.json({
    retentionCompletedDays: RETENTION_COMPLETED_DAYS,
    retentionFailedDays: Number(process.env.RETENTION_FAILED_DAYS) || 1,
    message: `Completed jobs auto-delete after ${RETENTION_COMPLETED_DAYS} days. Failed jobs auto-delete after ${Number(process.env.RETENTION_FAILED_DAYS) || 1} day(s).`,
  });
});

// ── Manual cleanup endpoint ──
router.delete("/cleanup", async (req, res): Promise<void> => {
  try {
    const days = Number(req.query.olderThanDays) || undefined;

    let result;
    if (days !== undefined) {
      // Delete jobs older than specified days
      result = await cleanupOlderThan(days);
    } else {
      // Run default scheduled cleanup
      result = await runCleanup();
    }

    res.json({
      message: `Cleanup completed`,
      ...result,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to run cleanup");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── List jobs (SELECTIVE COLUMNS — never load base64 data) ──
router.get("/", async (req, res): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const bankId = req.query.bankId ? Number(req.query.bankId) : undefined;
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;

    const conditions = [];
    if (status && ["pending", "processing", "completed", "failed"].includes(status)) {
      conditions.push(eq(jobsTable.status, status));
    }
    if (bankId) {
      conditions.push(eq(jobsTable.bankId, bankId));
    }
    if (dateFrom) {
      conditions.push(gte(jobsTable.createdAt, dateFrom));
    }
    if (dateTo) {
      conditions.push(lte(jobsTable.createdAt, dateTo));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [jobs, countResult] = await Promise.all([
      db
        .select({
          id: jobsTable.id,
          bankId: jobsTable.bankId,
          bankName: jobsTable.bankName,
          auditType: jobsTable.auditType,
          status: jobsTable.status,
          originalFilename: jobsTable.originalFilename,
          fileCount: jobsTable.fileCount,
          errorMessage: jobsTable.errorMessage,
          createdAt: jobsTable.createdAt,
          updatedAt: jobsTable.updatedAt,
        })
        .from(jobsTable)
        .where(whereClause)
        .orderBy(desc(jobsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(jobsTable)
        .where(whereClause),
    ]);

    const total = Number(countResult[0]?.count) || 0;
    const totalPages = Math.ceil(total / limit);

    const jobsWithRetention = jobs.map((job) => {
      const expiresAt = new Date(job.createdAt.getTime() + RETENTION_COMPLETED_DAYS * 24 * 60 * 60 * 1000);
      const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
      return {
        ...job,
        expiresAt: expiresAt.toISOString(),
        daysUntilExpiry: daysLeft,
        retentionDays: RETENTION_COMPLETED_DAYS,
      };
    });

    res.json({
      data: jobsWithRetention,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    });
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
      processedFiles: 0,
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

// ── Get job detail (SELECTIVE COLUMNS for generated files) ──
router.get("/:id", async (req, res): Promise<void> => {
  const parsed = GetJobParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [job] = await db
      .select({
        id: jobsTable.id,
        bankId: jobsTable.bankId,
        bankName: jobsTable.bankName,
        auditType: jobsTable.auditType,
        status: jobsTable.status,
        originalFilename: jobsTable.originalFilename,
        fileCount: jobsTable.fileCount,
        processedFiles: jobsTable.processedFiles,
        currentFile: jobsTable.currentFile,
        errorMessage: jobsTable.errorMessage,
        createdAt: jobsTable.createdAt,
        updatedAt: jobsTable.updatedAt,
      })
      .from(jobsTable)
      .where(eq(jobsTable.id, parsed.data.id));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    // Select only metadata columns from generated files — never load fileData
    const files = await db
      .select({
        id: generatedFilesTable.id,
        jobId: generatedFilesTable.jobId,
        filename: generatedFilesTable.filename,
        branchCode: generatedFilesTable.branchCode,
        branchName: generatedFilesTable.branchName,
        rowCount: generatedFilesTable.rowCount,
        fileSize: generatedFilesTable.fileSize,
        createdAt: generatedFilesTable.createdAt,
      })
      .from(generatedFilesTable)
      .where(eq(generatedFilesTable.jobId, job.id));

    const baseUrl = `/api/jobs/${job.id}`;
    const enrichedFiles = files.map((f) => ({
      ...f,
      downloadUrl: `${baseUrl}/files/${encodeURIComponent(f.filename)}`,
    }));

    // Compute retention info
    const expiresAt = new Date(job.createdAt.getTime() + RETENTION_COMPLETED_DAYS * 24 * 60 * 60 * 1000);
    const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

    res.json({
      ...job,
      files: enrichedFiles,
      downloadAllUrl: files.length > 0 ? `${baseUrl}/download-all` : null,
      expiresAt: expiresAt.toISOString(),
      daysUntilExpiry: daysLeft,
      retentionDays: RETENTION_COMPLETED_DAYS,
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
    const [job] = await db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.id, parsed.data.id));
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
      res.status(400).json({ error: "Original file is no longer available for retry (reclaimed after successful processing)" });
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
      res.status(410).json({ error: "File data has been cleaned up (expired)" });
      return;
    }

    const pdfBuffer = Buffer.from(file.fileData, "base64");

    const forceDownload = req.query.download === "1";
    const disposition = forceDownload ? "attachment" : "inline";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${encodeURIComponent(filename)}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(pdfBuffer);
  } catch (err) {
    req.log.error({ err }, "Failed to download file");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Download all as ZIP (JSZip) ──
router.get("/:id/download-all", async (req, res): Promise<void> => {
  const jobId = Number(req.params.id);
  if (isNaN(jobId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [job] = await db
      .select({
        id: jobsTable.id,
        bankName: jobsTable.bankName,
        auditType: jobsTable.auditType,
      })
      .from(jobsTable)
      .where(eq(jobsTable.id, jobId));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    const files = await db.select().from(generatedFilesTable).where(eq(generatedFilesTable.jobId, jobId));
    if (files.length === 0) {
      res.status(404).json({ error: "No output files found" });
      return;
    }

    const filesWithData = files.filter((f) => f.fileData);
    if (filesWithData.length === 0) {
      res.status(410).json({ error: "File data has been cleaned up (expired)" });
      return;
    }

    const zip = new JSZip();
    for (const file of filesWithData) {
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
