import { Router } from "express";
import { db } from "@workspace/db";
import { templatesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

router.get("/", async (_req, res): Promise<void> => {
  try {
    const templates = await db
      .select()
      .from(templatesTable)
      .where(eq(templatesTable.isActive, true))
      .orderBy(desc(templatesTable.updatedAt));
    res.json(templates);
  } catch (err) {
    logger.error({ err }, "Failed to list templates");
    res.status(500).json({ error: "Failed to list templates" });
  }
});

router.get("/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [template] = await db.select().from(templatesTable).where(eq(templatesTable.id, id));
    if (!template) { res.status(404).json({ error: "Template not found" }); return; }
    res.json(template);
  } catch (err) {
    logger.error({ err }, "Failed to get template");
    res.status(500).json({ error: "Failed to get template" });
  }
});

router.post("/", async (req, res): Promise<void> => {
  const { name, description, config } = req.body;
  if (!name || !config) {
    res.status(400).json({ error: "name and config are required" });
    return;
  }
  try {
    const [created] = await db
      .insert(templatesTable)
      .values({ name, description: description ?? null, config })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    logger.error({ err }, "Failed to create template");
    res.status(500).json({ error: "Failed to create template" });
  }
});

router.put("/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, description, config } = req.body;
  try {
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (config !== undefined) updates.config = config;
    const [updated] = await db
      .update(templatesTable)
      .set(updates)
      .where(eq(templatesTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Template not found" }); return; }
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to update template");
    res.status(500).json({ error: "Failed to update template" });
  }
});

router.delete("/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.update(templatesTable).set({ isActive: false }).where(eq(templatesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Failed to delete template");
    res.status(500).json({ error: "Failed to delete template" });
  }
});

export default router;
