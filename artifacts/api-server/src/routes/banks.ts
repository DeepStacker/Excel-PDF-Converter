import { Router } from "express";
import { db } from "@workspace/db";
import { banksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateBankBody,
  UpdateBankBody,
  GetBankParams,
  UpdateBankParams,
  DeleteBankParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res): Promise<void> => {
  try {
    const banks = await db.select().from(banksTable).orderBy(banksTable.createdAt);
    res.json(banks);
  } catch (err) {
    req.log.error({ err }, "Failed to list banks");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res): Promise<void> => {
  const parsed = CreateBankBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, code, description, columnMapping, pdfStyle, auditTypes, isActive } = parsed.data;
  try {
    const [bank] = await db.insert(banksTable).values({
      name,
      code: code.toUpperCase(),
      description: description ?? null,
      columnMapping,
      pdfStyle: pdfStyle ?? null,
      auditTypes,
      isActive: isActive ?? true,
    }).returning();
    res.status(201).json(bank);
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to create bank");
    if ((err as NodeJS.ErrnoException & { code?: string })?.code === "23505") {
      res.status(409).json({ error: "Bank code already exists. Use a different code." });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res): Promise<void> => {
  const parsed = GetBankParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const [bank] = await db.select().from(banksTable).where(eq(banksTable.id, parsed.data.id));
    if (!bank) { res.status(404).json({ error: "Bank not found" }); return; }
    res.json(bank);
  } catch (err) {
    req.log.error({ err }, "Failed to get bank");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res): Promise<void> => {
  const paramsParsed = UpdateBankParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const bodyParsed = UpdateBankBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: bodyParsed.error.message }); return; }

  try {
    const updates: Record<string, unknown> = {
      updatedAt: new Date(), // always set explicitly to guarantee the column refreshes
    };
    const b = bodyParsed.data;
    if (b.name !== undefined) updates.name = b.name;
    if (b.code !== undefined) updates.code = b.code.toUpperCase();
    if (b.description !== undefined) updates.description = b.description;
    if (b.columnMapping !== undefined) updates.columnMapping = b.columnMapping;
    if (b.pdfStyle !== undefined) updates.pdfStyle = b.pdfStyle;
    if (b.auditTypes !== undefined) updates.auditTypes = b.auditTypes;
    if (b.isActive !== undefined) updates.isActive = b.isActive;

    const [bank] = await db
      .update(banksTable)
      .set(updates)
      .where(eq(banksTable.id, paramsParsed.data.id))
      .returning();
    if (!bank) { res.status(404).json({ error: "Bank not found" }); return; }
    res.json(bank);
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to update bank");
    if ((err as NodeJS.ErrnoException & { code?: string })?.code === "23505") {
      res.status(409).json({ error: "Bank code already exists. Use a different code." });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res): Promise<void> => {
  const parsed = DeleteBankParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [bank] = await db.delete(banksTable).where(eq(banksTable.id, parsed.data.id)).returning();
    if (!bank) { res.status(404).json({ error: "Bank not found" }); return; }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete bank");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
