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

export interface PdfConfig {
  columnMapping: {
    branchGroupBy: string;
    branchNameCol: string;
    stateCol: string;
    columns: ColumnConfig[];
  };
  pdfStyle: {
    pageSize?: "A4" | "Letter" | "Legal" | "A3";
    pageOrientation?: "landscape" | "portrait";
    headerColor1?: string;
    headerColor2?: string;
    alternateRowColor?: string;
    fontSize?: number;
    headerFontSize?: number;
    rowHeight?: number;
    headerRowHeight?: number;
    fontFamily?: string;
    reportTitle?: string;
    showDate?: boolean;
    showAuditType?: boolean;
    showPageNumbers?: boolean;
    footerText?: string;
    marginTop?: number;
    marginRight?: number;
    marginBottom?: number;
    marginLeft?: number;
  };
}

export interface PdfProgress {
  processed: number;
  total: number;
  currentFile: string;
}

type ProgressCallback = (progress: PdfProgress) => void;

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

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    };
  }
  return { r: 255, g: 255, b: 255 };
}

const PAGE_SIZE_MAP: Record<string, { widthMm: number; heightMm: number }> = {
  "A4":     { widthMm: 210, heightMm: 297 },
  "Letter": { widthMm: 216, heightMm: 279 },
  "Legal":  { widthMm: 216, heightMm: 356 },
  "A3":     { widthMm: 297, heightMm: 420 },
};

function generateHtml(
  rows: Record<string, unknown>[],
  auditType: string,
  branchCode: string,
  branchName: string,
  state: string,
  columns: ColumnConfig[],
  config: PdfConfig,
  columnNameMap: Map<string, string>
): string {
  const { pdfStyle } = config;
  const fontSize = pdfStyle.fontSize || 9;
  const headerFontSize = pdfStyle.headerFontSize || pdfStyle.fontSize || 9;
  const headerRowHeight = pdfStyle.headerRowHeight || 22.5;
  const rowHeight = pdfStyle.rowHeight || 30.5;
  const color1 = hexToRgb(pdfStyle.headerColor1 || "#FFCC00");
  const color2 = hexToRgb(pdfStyle.headerColor2 || "#4985E8");
  const altRowColor = pdfStyle.alternateRowColor || "#F2F2F2";
  const fontFamily = pdfStyle.fontFamily || "Arial";
  const showPageNumbers = pdfStyle.showPageNumbers !== false;
  const footerText = pdfStyle.footerText || "";
  const reportTitle = pdfStyle.reportTitle || "";
  const showDate = pdfStyle.showDate !== false;
  const showAuditType = pdfStyle.showAuditType !== false;
  const mTop = pdfStyle.marginTop ?? 15;
  const mRight = pdfStyle.marginRight ?? 50;
  const mBottom = pdfStyle.marginBottom ?? 15;
  const mLeft = pdfStyle.marginLeft ?? 50;
  const isLandscape = pdfStyle.pageOrientation !== "portrait";

  const SR_NO_WIDTH = 22.2;
  const colWidths = [SR_NO_WIDTH, ...columns.map(c => c.width)];
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const numCols = colWidths.length;
  const midpoint = Math.floor(columns.length / 2);

  // Build header rows
  let headerRowsHtml = "";
  if (numCols >= 7) {
    const leftCols = numCols - 7;
    headerRowsHtml = `
      <tr style="height: 12.2px;">
        <td colspan="2" style="border: 0.5px solid #000; font-weight: bold; padding: 2px; font-size:${fontSize}px;">Audit Type :</td>
        <td colspan="2" style="border: 0.5px solid #000; padding: 2px; font-size:${fontSize}px;">${showAuditType ? auditType : ""}</td>
        <td colspan="${leftCols}" style="border: 0;"></td>
        <td colspan="2" style="border: 0.5px solid #000; font-weight: bold; padding: 2px; font-size:${fontSize}px;">Branch Name :</td>
        <td colspan="2" style="border: 0.5px solid #000; padding: 2px; font-size:${fontSize}px;">${branchName}</td>
      </tr>
      <tr style="height: 14.2px;">
        <td colspan="2" style="border: 0.5px solid #000; font-weight: bold; padding: 2px; font-size:${fontSize}px;">Branch Code :</td>
        <td colspan="2" style="border: 0.5px solid #000; padding: 2px; font-size:${fontSize}px;">${branchCode}</td>
        <td colspan="${leftCols}" style="border: 0;"></td>
        <td colspan="2" style="border: 0.5px solid #000; font-weight: bold; padding: 2px; font-size:${fontSize}px;">State :</td>
        <td colspan="2" style="border: 0.5px solid #000; padding: 2px; font-size:${fontSize}px;">${state}</td>
      </tr>`;
  } else if (numCols >= 4) {
    const mid = Math.floor(numCols / 2);
    headerRowsHtml = `
      <tr style="height: 12.2px;">
        <td colspan="${mid}" style="border: 0.5px solid #000; font-weight: bold; padding: 2px; font-size:${fontSize}px;">Audit Type :</td>
        <td colspan="${mid}" style="border: 0.5px solid #000; padding: 2px; font-size:${fontSize}px;">${showAuditType ? auditType : ""}</td>
        <td colspan="${mid}" style="border: 0.5px solid #000; font-weight: bold; padding: 2px; font-size:${fontSize}px;">Branch Name :</td>
        <td colspan="${numCols - mid * 2}" style="border: 0.5px solid #000; padding: 2px; font-size:${fontSize}px;">${branchName}</td>
      </tr>
      <tr style="height: 14.2px;">
        <td colspan="${mid}" style="border: 0.5px solid #000; font-weight: bold; padding: 2px; font-size:${fontSize}px;">Branch Code :</td>
        <td colspan="${mid}" style="border: 0.5px solid #000; padding: 2px; font-size:${fontSize}px;">${branchCode}</td>
        <td colspan="${mid}" style="border: 0.5px solid #000; font-weight: bold; padding: 2px; font-size:${fontSize}px;">State :</td>
        <td colspan="${numCols - mid * 2}" style="border: 0.5px solid #000; padding: 2px; font-size:${fontSize}px;">${state}</td>
      </tr>`;
  } else {
    headerRowsHtml = `
      <tr style="height: 12.2px;">
        <td colspan="${numCols}" style="border: 0.5px solid #000; font-weight: bold; padding: 2px; font-size:${fontSize}px;">${showAuditType ? `Audit: ${auditType}` : `Branch: ${branchCode}`}</td>
      </tr>
      <tr style="height: 14.2px;">
        <td colspan="${numCols}" style="border: 0.5px solid #000; padding: 2px; font-size:${fontSize}px;">Branch: ${branchCode} — ${branchName}</td>
      </tr>`;
  }

  // Column headers with alternating two-zone colors
  const headerCells = columns.map((col, idx) => {
    const bgColor = idx < midpoint ? `rgb(${color1.r},${color1.g},${color1.b})` : `rgb(${color2.r},${color2.g},${color2.b})`;
    const headerText = col.header.replace(/\n/g, "<br/>");
    return `<th style="padding: 0; border: 0.5px solid #000; background: ${bgColor}; color: white; font-weight: bold; font-size: ${headerFontSize}px; height: ${headerRowHeight}px; vertical-align: middle; text-align: center;">${headerText}</th>`;
  }).join("");

  const srNoHeaderBg = `rgb(${color1.r},${color1.g},${color1.b})`;
  const headersHtml = `
    <tr style="height: ${headerRowHeight}px;">
      <th style="padding: 0; border: 0.5px solid #000; background: ${srNoHeaderBg}; color: white; font-weight: bold; font-size: ${headerFontSize}px; vertical-align: middle; text-align: center;">Sr<br/>No</th>
      ${headerCells}
    </tr>`;

  // Data rows
  const dataRowsHtml = rows.map((row, idx) => {
    const bgColor = idx % 2 === 1 ? altRowColor : "#FFFFFF";
    const cells = columns.map(col => {
      let value = "";
      if (col.excelColumn) {
        const actualColName = columnNameMap.get(col.excelColumn.toLowerCase()) || col.excelColumn;
        value = String(row[actualColName] ?? "");
      }
      if (col.dataType === "number" && col.excelColumn) {
        value = formatNumber(row[columnNameMap.get(col.excelColumn.toLowerCase()) || col.excelColumn] ?? "");
      }
      const align = col.dataType === "number" ? "right" : "left";
      return `<td style="padding: 0 2px; border: 0.5px solid #999; background: ${bgColor}; text-align: ${align}; font-size: ${fontSize}px; height: ${rowHeight}px; vertical-align: middle;">${value}</td>`;
    }).join("");

    return `
      <tr style="height: ${rowHeight}px;">
        <td style="padding: 0; border: 0.5px solid #999; background: ${bgColor}; text-align: center; font-size: ${fontSize}px; font-weight: bold; vertical-align: middle;">${idx + 1}</td>
        ${cells}
      </tr>`;
  }).join("");

  // Footer section
  const hasFooter = showPageNumbers || footerText;
  const footerHtml = hasFooter ? `
    <tfoot>
      <tr>
        <td colspan="${numCols}" style="border-top: 0.5px solid #ccc; padding: 2px 0; font-size: ${Math.max(7, fontSize - 1)}px; color: #888;">
          <div style="display: flex; justify-content: space-between;">
            <span>${footerText}</span>
            ${showPageNumbers ? `<span style="padding-right:4px;">Page 1</span>` : ""}
          </div>
        </td>
      </tr>
    </tfoot>` : "";

  // Report title row (if set)
  const titleHtml = reportTitle ? `
    <tr>
      <td colspan="${numCols}" style="font-size: ${fontSize + 1}px; font-weight: bold; padding: 2px 0; border: 0; color: #333;">${reportTitle}</td>
    </tr>` : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: '${fontFamily}', Arial, Helvetica, sans-serif; }
    table { border-collapse: collapse; width: ${totalWidth}px; }
    @page { size: ${(pdfStyle.pageSize || "A4")} ${isLandscape ? "landscape" : "portrait"}; margin: ${mTop}mm ${mRight}mm ${mBottom}mm ${mLeft}mm; }
  </style>
</head>
<body>
  <table>
    <thead>
      ${titleHtml}
      ${headerRowsHtml}
      ${headersHtml}
    </thead>
    <tbody>
      ${dataRowsHtml}
    </tbody>
    ${footerHtml}
  </table>
</body>
</html>`;
}

function findRequiredColumns(columns: ColumnConfig[]): Set<string> {
  const required = new Set<string>();
  for (const col of columns) {
    if (col.excelColumn) {
      required.add(col.excelColumn);
    }
  }
  return required;
}

function findBestSheet(workbook: XLSX.WorkBook, requiredColumns: Set<string>, branchGroupBy: string, branchNameCol: string): string | null {
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
    if (range.e.r === 0) continue;

    const headers: string[] = [];
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c: C })];
      headers.push(cell ? String(cell.v || "").trim() : "");
    }

    const headerSet = new Set(headers.map(h => h.toLowerCase()));
    let matchCount = 0;

    if (headerSet.has(branchGroupBy.toLowerCase())) matchCount++;
    if (branchNameCol && headerSet.has(branchNameCol.toLowerCase())) matchCount++;

    for (const col of requiredColumns) {
      if (headerSet.has(col.toLowerCase())) matchCount++;
    }

    if (matchCount >= 2) {
      return sheetName;
    }
  }
  return workbook.SheetNames[0] || null;
}

function normalizeHeaders(headers: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < headers.length; i++) {
    const lower = headers[i].toLowerCase().trim();
    if (lower) {
      map.set(lower, headers[i]);
    }
  }
  return map;
}

function readExcel(excelPath: string, columnMapping: { branchGroupBy: string; branchNameCol: string; stateCol: string; columns: ColumnConfig[] }): { rows: Record<string, unknown>[]; allRows: number } {
  const buffer = fs.readFileSync(excelPath);
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

  const requiredColumns = findRequiredColumns(columnMapping.columns);
  const sheetName = findBestSheet(workbook, requiredColumns, columnMapping.branchGroupBy, columnMapping.branchNameCol);

  if (!sheetName) {
    throw new Error("No valid sheet found in Excel file");
  }

  const worksheet = workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");

  const headers: string[] = [];
  for (let C = range.s.c; C <= range.e.c; C++) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c: C })];
    headers.push(cell ? String(cell.v || "").trim() : "");
  }

  const rows: Record<string, unknown>[] = [];

  for (let R = range.s.r + 1; R <= range.e.r; R++) {
    const row: Record<string, unknown> = {};
    let hasData = false;

    for (let C = range.s.c; C <= range.e.c; C++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })];
      const header = headers[C];
      if (header) {
        const val = cell ? (cell.v !== undefined && cell.v !== null ? cell.v : "") : "";
        row[header] = val;
        if (val !== "" && val !== undefined) hasData = true;
      }
    }

    if (hasData) {
      rows.push(row);
    }
  }

  return { rows, allRows: rows.length };
}

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser) {
    try {
      await browser.version();
      return browser;
    } catch {
      try {
        await browser.close();
      } catch { /* ignore close errors */ }
      browser = null;
    }
  }

  const launchOptions: Record<string, any> = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
    ],
  };

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  browser = await puppeteer.launch(launchOptions);
  return browser;
}

export async function generatePdf(
  excelPath: string,
  outputDir: string,
  auditType: string,
  config: PdfConfig,
  onProgress?: ProgressCallback
): Promise<PdfResult> {
  const { columnMapping, pdfStyle } = config;
  const branchGroupBy = columnMapping.branchGroupBy || "Branch Code";
  const branchNameCol = columnMapping.branchNameCol || "Branch Name";
  const stateCol = columnMapping.stateCol || "State";
  const columns = columnMapping.columns || [];

  const { rows } = readExcel(excelPath, columnMapping);

  if (rows.length === 0) {
    return { success: false, error: "Excel file has no data rows" };
  }

  const columnNameMap = new Map<string, string>();
  if (rows.length > 0) {
    for (const key of Object.keys(rows[0])) {
      columnNameMap.set(key.toLowerCase(), key);
    }
  }

  const groups: Record<string, { rows: Record<string, unknown>[]; branchName: string; state: string }> = {};
  for (const row of rows) {
    const branchKey = columnNameMap.get(branchGroupBy.toLowerCase()) || branchGroupBy;
    const branchCode = String(row[branchKey] || "Unknown").trim();
    if (!branchCode || branchCode === "None" || branchCode === "") {
      continue;
    }

    const nameKey = columnNameMap.get(branchNameCol.toLowerCase()) || branchNameCol;
    const stateKey = columnNameMap.get(stateCol.toLowerCase()) || stateCol;

    if (!groups[branchCode]) {
      groups[branchCode] = {
        rows: [],
        branchName: String(row[nameKey] || branchCode).trim(),
        state: String(row[stateKey] || "").trim(),
      };
    }
    groups[branchCode].rows.push(row);
  }

  if (Object.keys(groups).length === 0) {
    return { success: false, error: `No valid branches found. Check if "${branchGroupBy}" column exists in the Excel file.` };
  }

  // Resolve page dimensions
  const isLandscape = pdfStyle.pageOrientation !== "portrait";
  const pageSize = pdfStyle.pageSize || "A4";
  const pageDims = PAGE_SIZE_MAP[pageSize] || PAGE_SIZE_MAP["A4"];
  const mTop = pdfStyle.marginTop ?? 15;
  const mRight = pdfStyle.marginRight ?? 50;
  const mBottom = pdfStyle.marginBottom ?? 15;
  const mLeft = pdfStyle.marginLeft ?? 50;

  const generatedFiles: GeneratedFile[] = [];
  let page: Page | null = null;

  try {
    const browserInstance = await getBrowser();
    page = await browserInstance.newPage();

    const configColumnMap = new Map<string, ColumnConfig>();
    for (const col of columns) {
      if (col.excelColumn) {
        configColumnMap.set(col.excelColumn.toLowerCase(), col);
      }
    }

    for (const [branchCode, group] of Object.entries(groups)) {
      const safeName = group.branchName.replace(/[^\w\s\-.]/g, "_").replace(/[\s_]+/g, "_").slice(0, 100) || branchCode;
      const filename = `${safeName}_${auditType}.pdf`;
      const filepath = path.join(outputDir, filename);

      const html = generateHtml(
        group.rows,
        auditType.toUpperCase(),
        branchCode,
        group.branchName,
        group.state,
        columns,
        config,
        columnNameMap
      );

      await page.setContent(html, { waitUntil: "load" });

      // Compute final page width/height in mm based on orientation
      const finalWidthMm = isLandscape ? pageDims.heightMm : pageDims.widthMm;
      const finalHeightMm = isLandscape ? pageDims.widthMm : pageDims.heightMm;

      await page.pdf({
        path: filepath,
        width: `${finalWidthMm}mm`,
        height: `${finalHeightMm}mm`,
        landscape: false, // handled via explicit width/height
        printBackground: true,
        margin: {
          top: `${mTop}mm`,
          bottom: `${mBottom}mm`,
          left: `${mLeft}px`,
          right: `${mRight}px`,
        },
      });

      const fileSize = fs.statSync(filepath).size;
      generatedFiles.push({
        filename,
        branchCode: String(branchCode),
        branchName: group.branchName,
        rowCount: group.rows.length,
        fileSize,
      });

      if (onProgress) {
        onProgress({
          processed: generatedFiles.length,
          total: Object.keys(groups).length,
          currentFile: filename,
        });
      }
    }

    if (page) {
      await page.close();
    }

    return { success: true, files: generatedFiles };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  } finally {
    if (page) {
      try {
        await page.close();
      } catch { /* ignore cleanup errors */ }
    }
  }
}
