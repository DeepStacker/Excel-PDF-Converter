import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import puppeteer, { type Browser, type Page } from "puppeteer";

interface ColumnConfig {
  header: string;
  excelColumn: string | null;
  width: number;
  dataType: "text" | "number";
  headerColor?: string;
}

interface PdfConfig {
  columnMapping: {
    branchGroupBy: string;
    branchNameCol: string;
    stateCol: string;
    columns: ColumnConfig[];
  };
  pdfStyle: {
    pageOrientation?: "landscape" | "portrait";
    headerColor1?: string;
    headerColor2?: string;
    fontSize?: number;
    rowHeight?: number;
    headerRowHeight?: number;
  };
}

interface GeneratedFile {
  filename: string;
  branchCode: string;
  branchName: string;
  rowCount: number;
  fileSize: number;
}

interface PdfResult {
  success: boolean;
  files?: GeneratedFile[];
  error?: string;
}

function formatNumber(val: unknown): string {
  if (val === null || val === undefined || val === "") return "";
  try {
    const fval = Number(val);
    if (Number.isInteger(fval)) return String(fval);
    return String(fval);
  } catch {
    return String(val);
  }
}

function generateHtml(
  rows: Record<string, unknown>[],
  branchCode: string,
  branchName: string,
  state: string | undefined,
  auditType: string,
  columns: ColumnConfig[],
  config: PdfConfig
): string {
  const { pdfStyle } = config;
  const fontSize = pdfStyle.fontSize || 9;
  const rowHeight = pdfStyle.rowHeight || 20;
  const headerRowHeight = pdfStyle.headerRowHeight || 25;
  const headerColor1 = pdfStyle.headerColor1 || "#4472C4";
  const headerColor2 = pdfStyle.headerColor2 || "#B4C7E7";

  const colWidths = columns.map(c => c.width);
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);

  const rowsHtml = rows.map((row, idx) => {
    const bgColor = idx % 2 === 1 ? "#F2F2F2" : "#FFFFFF";
    const cells = columns.map(col => {
      let value = col.excelColumn ? String(row[col.excelColumn] || "") : "";
      if (col.dataType === "number") {
        value = formatNumber(row[col.excelColumn]);
      }
      const align = col.dataType === "number" ? "center" : "left";
      return `<td style="padding: 4px; border: 1px solid #999; background: ${bgColor}; text-align: ${align}; font-size: ${fontSize}px;">${value}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  const headers = columns.map(col => {
    const bgColor = "#FFFFFF";
    return `<th style="padding: 8px 4px; border: 1px solid #999; background: ${headerColor1}; color: white; font-size: ${fontSize}px; font-weight: bold;">${col.header}</th>`;
  }).join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; }
    .header { text-align: center; margin-bottom: 20px; }
    .title { font-size: 16px; font-weight: bold; color: #2F4F4F; margin-bottom: 5px; }
    .subtitle { font-size: 12px; color: #666; }
    table { border-collapse: collapse; width: 100%; }
    @page { size: A4 ${pdfStyle.pageOrientation || 'landscape'}; margin: 20mm; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">${auditType} - Branch: ${branchName}</div>
    ${state ? `<div class="subtitle">State: ${state}</div>` : ""}
  </div>
  <table style="width: ${totalWidth}px;">
    <thead>
      <tr>${headers}</tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
</body>
</html>`;
}

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
  }
  return browser;
}

export async function generatePdf(
  excelPath: string,
  outputDir: string,
  auditType: string,
  config: PdfConfig
): Promise<PdfResult> {
  try {
    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

    if (data.length === 0) {
      return { success: false, error: "Excel file is empty" };
    }

    const { columnMapping } = config;
    const branchGroupBy = columnMapping.branchGroupBy || "Branch Code";
    const branchNameCol = columnMapping.branchNameCol || "Branch Name";
    const stateCol = columnMapping.stateCol || "State";
    const columns = columnMapping.columns || [];

    const groups: Record<string, { rows: Record<string, unknown>[]; branchName: string; state?: string }> = {};
    for (const row of data as Record<string, unknown>[]) {
      const branchCode = String(row[branchGroupBy] || "Unknown");
      if (!groups[branchCode]) {
        groups[branchCode] = {
          rows: [],
          branchName: String(row[branchNameCol] || branchCode),
          state: stateCol ? String(row[stateCol] || "") : undefined,
        };
      }
      groups[branchCode].rows.push(row);
    }

    const generatedFiles: GeneratedFile[] = [];
    const browser = await getBrowser();
    const page = await browser.newPage();

    const isLandscape = config.pdfStyle.pageOrientation !== "portrait";

    for (const [branchCode, group] of Object.entries(groups)) {
      const safeBranchCode = String(branchCode).replace(/[^\w\-]/g, "_").slice(0, 50);
      const safeBranchName = group.branchName.replace(/[^\w\-]/g, "_").slice(0, 50);
      const filename = `${safeBranchCode}_${safeBranchName}.pdf`;
      const filepath = path.join(outputDir, filename);

      const html = generateHtml(
        group.rows,
        branchCode,
        group.branchName,
        group.state,
        auditType,
        columns,
        config
      );

      await page.setContent(html, { waitUntil: "networkidle0" });

      await page.pdf({
        path: filepath,
        format: "A4",
        landscape: isLandscape,
        printBackground: true,
        margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" }
      });

      const fileSize = fs.statSync(filepath).size;
      generatedFiles.push({
        filename,
        branchCode: String(branchCode),
        branchName: group.branchName,
        rowCount: group.rows.length,
        fileSize,
      });
    }

    await page.close();

    return { success: true, files: generatedFiles };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}