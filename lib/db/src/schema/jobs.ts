import { pgTable, text, serial, timestamp, integer, index, boolean, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  bankId: integer("bank_id").notNull(),
  bankName: text("bank_name").notNull(),
  auditType: text("audit_type").notNull(),
  status: text("status").notNull().default("pending"),
  originalFilename: text("original_filename").notNull(),
  uploadedFileData: text("uploaded_file_data"), // base64 encoded
  fileCount: integer("file_count").notNull().default(0),
  processedFiles: integer("processed_files").notNull().default(0),
  currentFile: text("current_file"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("jobs_status_idx").on(table.status),
  index("jobs_bank_id_idx").on(table.bankId),
  index("jobs_created_at_idx").on(table.createdAt),
]);

export const generatedFilesTable = pgTable("generated_files", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  filename: text("filename").notNull(),
  branchCode: text("branch_code").notNull(),
  branchName: text("branch_name").notNull(),
  rowCount: integer("row_count").notNull().default(0),
  fileSize: integer("file_size"),
  fileData: text("file_data"), // base64 encoded
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("generated_files_job_id_idx").on(table.jobId),
]);

export const insertJobSchema = createInsertSchema(jobsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
export type GeneratedFile = typeof generatedFilesTable.$inferSelect;
