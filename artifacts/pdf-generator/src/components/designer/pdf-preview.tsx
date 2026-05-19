import { useState, useMemo } from "react";
import { Eye, Loader2, AlertCircle, ChevronLeft, ChevronRight, Rocket, Save, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkbookData } from "@/lib/excel-engine";
import { ColumnMapping, PdfStyle, RuleConfig, FullTemplateConfig, hexToRgb } from "@/lib/template-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const API_BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") + "/api";

interface PdfPreviewProps {
  workbook: WorkbookData | null;
  originalFile: File | null;
  columnMapping: ColumnMapping;
  pdfStyle: PdfStyle;
  rules: RuleConfig;
  templateName: string;
  templateDescription: string;
  onTemplateNameChange: (name: string) => void;
  onTemplateDescriptionChange: (desc: string) => void;
  savedTemplateId: number | null;
  onTemplateSaved: (id: number) => void;
}

interface BranchData {
  code: string;
  name: string;
  state: string;
  rows: Record<string, unknown>[];
}

export function PdfPreview({
  workbook, originalFile, columnMapping, pdfStyle, rules,
  templateName, templateDescription, onTemplateNameChange, onTemplateDescriptionChange,
  savedTemplateId, onTemplateSaved,
}: PdfPreviewProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedBranchIdx, setSelectedBranchIdx] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [auditType, setAuditType] = useState("AUDIT");

  const branches = useMemo((): BranchData[] => {
    if (!workbook || !columnMapping.branchGroupBy) return [];
    const groupByCol = columnMapping.branchGroupBy.columnName;
    const nameCol = columnMapping.branchName?.columnName ?? null;
    const stateCol = columnMapping.state?.columnName ?? null;
    const sheetIdx = rules.dataSheetIndex ?? 0;
    const sheet = workbook.sheets[Math.min(sheetIdx, workbook.sheets.length - 1)];
    if (!sheet) return [];
    const rows = (workbook.sheetRows[sheet.name] ?? []) as Record<string, unknown>[];
    const seen = new Map<string, BranchData>();
    for (const row of rows) {
      const code = String(row[groupByCol] ?? "").trim();
      if (!code) continue;
      if (!seen.has(code)) {
        seen.set(code, {
          code,
          name: nameCol ? String(row[nameCol] ?? code) : code,
          state: stateCol ? String(row[stateCol] ?? "") : "",
          rows: [],
        });
      }
      seen.get(code)!.rows.push(row);
    }
    return Array.from(seen.values());
  }, [workbook, columnMapping, rules.dataSheetIndex]);

  const selectedBranch = branches[Math.min(selectedBranchIdx, branches.length - 1)];

  const previewUrl = useMemo(() => {
    if (!selectedBranch || columnMapping.tableColumns.length === 0) return null;
    const html = buildPreviewHtml(
      selectedBranch.rows.slice(0, 40),
      selectedBranch.code,
      selectedBranch.name,
      selectedBranch.state,
      auditType,
      columnMapping,
      pdfStyle,
      rules.showSrNo,
    );
    const blob = new Blob([html], { type: "text/html" });
    return URL.createObjectURL(blob);
  }, [selectedBranch, auditType, columnMapping, pdfStyle, rules.showSrNo]);

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast({ title: "Template name required", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const config: FullTemplateConfig = { name: templateName, description: templateDescription, columnMapping, pdfStyle, rules };
      const method = savedTemplateId ? "PUT" : "POST";
      const url = savedTemplateId ? `${API_BASE}/templates/${savedTemplateId}` : `${API_BASE}/templates`;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: templateName, description: templateDescription, config }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const saved = await res.json();
      onTemplateSaved(saved.id);
      toast({ title: savedTemplateId ? "Template updated" : "Template saved!", description: `"${templateName}" is ready to use.` });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateAll = async () => {
    if (!originalFile) {
      toast({ title: "No Excel file loaded", description: "Upload a file in the Excel Engine tab first.", variant: "destructive" });
      return;
    }
    if (!columnMapping.branchGroupBy) {
      toast({ title: "Branch Group By not configured", description: "Set it in the Data Mapping tab.", variant: "destructive" });
      return;
    }
    if (columnMapping.tableColumns.length === 0) {
      toast({ title: "No table columns defined", description: "Add table columns in the Data Mapping tab.", variant: "destructive" });
      return;
    }
    setIsGenerating(true);
    try {
      const config: FullTemplateConfig = { name: templateName, description: templateDescription, columnMapping, pdfStyle, rules };
      const formData = new FormData();
      formData.append("file", originalFile);
      formData.append("auditType", auditType.trim() || "AUDIT");
      formData.append("templateConfig", JSON.stringify(config));
      const res = await fetch(`${API_BASE}/jobs`, { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create job");
      }
      const job = await res.json();
      toast({ title: "Generation started!", description: `Processing ${branches.length} branch${branches.length !== 1 ? "es" : ""}…` });
      setLocation(`/jobs/${job.id}`);
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const isReady = !!columnMapping.branchGroupBy && columnMapping.tableColumns.length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 py-2.5 border-b bg-muted/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">Preview & Generate</span>
          {branches.length > 0 && (
            <Badge variant="secondary" className="text-xs">{branches.length} branches detected</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={handleSaveTemplate} disabled={isSaving}>
            {isSaving ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</> : savedTemplateId ? <><CheckCircle className="h-3 w-3 text-green-500" /> Update Template</> : <><Save className="h-3 w-3" /> Save Template</>}
          </Button>
          <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={handleGenerateAll} disabled={isGenerating || !isReady || !originalFile}>
            {isGenerating ? <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</> : <><Rocket className="h-3 w-3" /> Generate All PDFs</>}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-60 xl:w-64 border-r flex flex-col shrink-0 bg-card">
          <div className="p-3 border-b space-y-2.5">
            <div>
              <Label className="text-xs text-muted-foreground">Template Name</Label>
              <Input value={templateName} onChange={e => onTemplateNameChange(e.target.value)} className="h-7 text-xs mt-1" placeholder="My Audit Template" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description (optional)</Label>
              <Input value={templateDescription} onChange={e => onTemplateDescriptionChange(e.target.value)} className="h-7 text-xs mt-1" placeholder="Brief description…" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Audit Type Label</Label>
              <Input value={auditType} onChange={e => setAuditType(e.target.value)} className="h-7 text-xs mt-1" placeholder="e.g. CASH, FIXED DEPOSIT…" />
            </div>
          </div>

          <div className="px-3 py-2 border-b">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Branches ({branches.length})
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {branches.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs text-muted-foreground">
                  {!workbook ? "Upload a workbook in Module 1" : !columnMapping.branchGroupBy ? "Set Branch Group By in Module 2" : "No branches found"}
                </p>
              </div>
            ) : (
              <div className="py-1">
                {branches.map((b, idx) => (
                  <button key={b.code} onClick={() => setSelectedBranchIdx(idx)}
                    className={cn("w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-muted/50", selectedBranchIdx === idx && "bg-primary/10 text-primary")}>
                    <div className="font-medium truncate">{b.name || b.code}</div>
                    <div className="text-muted-foreground">{b.code} · {b.rows.length} rows</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {!isReady && (
            <div className="p-3 border-t bg-amber-50 dark:bg-amber-950/30">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  {!columnMapping.branchGroupBy ? "Set Branch Group By in Data Mapping." : "Add table columns in Data Mapping."}
                </p>
              </div>
            </div>
          )}
          {isReady && !originalFile && (
            <div className="p-3 border-t bg-blue-50 dark:bg-blue-950/30">
              <p className="text-xs text-blue-800 dark:text-blue-200">Upload Excel in tab 1 to enable generation.</p>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto bg-muted/30 flex flex-col items-center py-6 px-4">
          {!previewUrl ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
              <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
                <Eye className="h-10 w-10 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-sm">PDF Preview</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  {!workbook ? "Upload a workbook in the Excel Engine tab." :
                    !columnMapping.branchGroupBy ? "Set Branch Group By in Data Mapping." :
                      columnMapping.tableColumns.length === 0 ? "Add table columns in Data Mapping." :
                        branches.length === 0 ? "No branches detected in the data." :
                          "Select a branch to preview."}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-3">
                <Button variant="outline" size="sm" className="h-7 px-2" disabled={selectedBranchIdx === 0} onClick={() => setSelectedBranchIdx(i => i - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs font-medium">
                  {selectedBranch?.name} <span className="text-muted-foreground">({selectedBranch?.code})</span>
                  {selectedBranch?.state ? <span className="text-muted-foreground"> · {selectedBranch.state}</span> : ""}
                  <span className="text-muted-foreground"> · {selectedBranch?.rows.length} rows</span>
                </span>
                <span className="text-xs text-muted-foreground">{selectedBranchIdx + 1}/{branches.length}</span>
                <Button variant="outline" size="sm" className="h-7 px-2" disabled={selectedBranchIdx >= branches.length - 1} onClick={() => setSelectedBranchIdx(i => i + 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="rounded-lg overflow-hidden shadow-xl border bg-white w-full max-w-5xl">
                <iframe src={previewUrl} className="w-full" style={{ height: 680, border: "none" }} title="PDF Preview" key={previewUrl} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Showing up to 40 rows preview · Actual PDFs generated server-side with all data
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function buildPreviewHtml(
  rows: Record<string, unknown>[],
  branchCode: string,
  branchName: string,
  state: string,
  auditType: string,
  mapping: ColumnMapping,
  style: PdfStyle,
  showSrNo: boolean,
): string {
  const cols = mapping.tableColumns;
  const c1 = hexToRgb(style.headerColor1);
  const c2 = hexToRgb(style.headerColor2);
  const midpoint = Math.floor(cols.length / 2);
  const srW = 40;

  const headerCells = [
    showSrNo ? `<th style="width:${srW}px;padding:4px 3px;border:0.5px solid #999;background:rgb(${c1.r},${c1.g},${c1.b});color:white;font-weight:bold;font-size:${style.headerFontSize}px;text-align:center;vertical-align:middle;">Sr<br/>No</th>` : "",
    ...cols.map((col, idx) => {
      const bg = idx < midpoint ? `rgb(${c1.r},${c1.g},${c1.b})` : `rgb(${c2.r},${c2.g},${c2.b})`;
      return `<th style="width:${col.width}px;padding:4px 3px;border:0.5px solid #999;background:${bg};color:white;font-weight:bold;font-size:${style.headerFontSize}px;text-align:center;vertical-align:middle;">${col.header.replace(/\n/g, "<br/>")}</th>`;
    }),
  ].join("");

  const dataRows = rows.map((row, rowIdx) => {
    const bg = rowIdx % 2 === 1 ? style.alternateRowColor : "#ffffff";
    const cells = [
      showSrNo ? `<td style="padding:3px;border:0.5px solid #ddd;background:${bg};text-align:center;font-size:${style.fontSize}px;height:${style.rowHeight}px;vertical-align:middle;">${rowIdx + 1}</td>` : "",
      ...cols.map(col => {
        let val = "";
        if (!col.isBlank && col.source) {
          const raw = row[col.source.columnName];
          if (raw !== null && raw !== undefined) {
            val = String(raw);
            if (col.dataType === "number") {
              const n = Number(raw);
              if (!isNaN(n)) val = n.toLocaleString("en-IN");
            } else if (col.dataType === "currency") {
              const n = Number(raw);
              if (!isNaN(n)) val = n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
          }
        }
        const align = col.alignment === "right" ? "right" : col.alignment === "center" ? "center" : "left";
        return `<td style="padding:3px;border:0.5px solid #ddd;background:${bg};text-align:${align};font-size:${style.fontSize}px;height:${style.rowHeight}px;vertical-align:middle;">${val}</td>`;
      }),
    ].join("");
    return `<tr>${cells}</tr>`;
  }).join("\n");

  const numCols = cols.length + (showSrNo ? 1 : 0);
  const half = Math.max(1, Math.floor(numCols / 2));
  const other = numCols - half;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: ${style.fontFamily}, Arial, sans-serif; padding: ${style.marginTop}px ${style.marginRight}px ${style.marginBottom}px ${style.marginLeft}px; }
  table { border-collapse: collapse; }
  @page { size: ${style.pageSize} ${style.pageOrientation}; }
</style>
</head><body>
<table style="width:100%;margin-bottom:4px;">
  <tr>
    <td colspan="${half}" style="border:0.5px solid #ccc;padding:3px 5px;font-size:${style.fontSize}px;"><b>Audit Type:</b> ${auditType}</td>
    <td colspan="${other}" style="border:0.5px solid #ccc;padding:3px 5px;font-size:${style.fontSize}px;"><b>Branch Name:</b> ${branchName}</td>
  </tr>
  <tr>
    <td colspan="${half}" style="border:0.5px solid #ccc;padding:3px 5px;font-size:${style.fontSize}px;"><b>Branch Code:</b> ${branchCode}</td>
    <td colspan="${other}" style="border:0.5px solid #ccc;padding:3px 5px;font-size:${style.fontSize}px;"><b>State:</b> ${state}</td>
  </tr>
</table>
<table style="width:100%;">
  <thead><tr style="height:${style.headerRowHeight}px;">${headerCells}</tr></thead>
  <tbody>${dataRows}</tbody>
</table>
${style.showPageNumbers || style.footerText ? `<div style="margin-top:8px;display:flex;justify-content:space-between;font-size:${Math.max(7, style.fontSize - 1)}px;color:#888;border-top:0.5px solid #ddd;padding-top:4px;"><span>${style.footerText}</span>${style.showPageNumbers ? "<span>Page 1</span>" : ""}</div>` : ""}
</body></html>`;
}
