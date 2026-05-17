import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shareTokensTable = pgTable("share_tokens", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertShareTokenSchema = createInsertSchema(shareTokensTable).omit({
  id: true,
  createdAt: true,
});

export type InsertShareToken = z.infer<typeof insertShareTokenSchema>;
export type ShareToken = typeof shareTokensTable.$inferSelect;
