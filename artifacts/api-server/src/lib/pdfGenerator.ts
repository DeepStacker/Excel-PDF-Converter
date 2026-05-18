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

function generateHtml(
  rows: Record<string, unknown>[],
  auditType: string,
  branchCode: string,
  branchName: string,
  state: string,
  columns: ColumnConfig[],
  config: PdfConfig
): string {
  const { pdfStyle } = config;
  const fontSize = pdfStyle.fontSize || 9;
  const headerRowHeight = pdfStyle.headerRowHeight || 22.5;
  const rowHeight = pdfStyle.rowHeight || 30.5;
  const color1 = hexToRgb(pdfStyle.headerColor1 || "#FFFF00");
  const color2 = hexToRgb(pdfStyle.headerColor2 || "#4985E8");

  const SR_NO_WIDTH = 22.2;
  const colWidths = [SR_NO_WIDTH, ...columns.map(c => c.width)];
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const numCols = colWidths.length;
  const midpoint = Math.floor(columns.length / 2);

  // Build header rows based on column count
  let headerRowsHtml = "";
  if (numCols >= 7) {
    const leftCols = numCols - 7;
    headerRowsHtml = `
      <tr style="height: 12.2px;">
        <td colspan="2" style="border: 0.5px solid #000; font-weight: bold; padding: 2px;">Audit Type :</td>
        <td colspan="2" style="border: 0.5px solid #000; padding: 2px;">${auditType}</td>
        <td colspan="${leftCols}" style="border: 0;"></td>
        <td colspan="2" style="border: 0.5px solid #000; font-weight: bold; padding: 2px;">Branch Name :</td>
        <td colspan="2" style="border: 0.5px solid #000; padding: 2px;">${branchName}</td>
      </tr>
      <tr style="height: 14.2px;">
        <td colspan="2" style="border: 0.5px solid #000; font-weight: bold; padding: 2px;">Branch Code :</td>
        <td colspan="2" style="border: 0.5px solid #000; padding: 2px;">${branchCode}</td>
        <td colspan="${leftCols}" style="border: 0;"></td>
        <td colspan="2" style="border: 0.5px solid #000; font-weight: bold; padding: 2px;">State :</td>
        <td colspan="2" style="border: 0.5px solid #000; padding: 2px;">${state}</td>
      </tr>`;
  } else if (numCols >= 4) {
    const mid = Math.floor(numCols / 2);
    headerRowsHtml = `
      <tr style="height: 12.2px;">
        <td colspan="${mid}" style="border: 0.5px solid #000; font-weight: bold; padding: 2px;">Audit Type :</td>
        <td colspan="${mid}" style="border: 0.5px solid #000; font-weight: bold; padding: 2px;">${auditType}</td>
        <td colspan="${mid}" style="border: 0.5px solid #000; font-weight: bold; padding: 2px;">Branch Name :</td>
        <td colspan="${numCols - mid * 2}" style="border: 0.5px solid #000; padding: 2px;">${branchName}</td>
      </tr>
      <tr style="height: 14.2px;">
        <td colspan="${mid}" style="border: 0.5px solid #000; font-weight: bold; padding: 2px;">Branch Code :</td>
        <td colspan="${mid}" style="border: 0.5px solid #000; padding: 2px;">${branchCode}</td>
        <td colspan="${mid}" style="border: 0.5px solid #000; font-weight: bold; padding: 2px;">State :</td>
        <td colspan="${numCols - mid * 2}" style="border: 0.5px solid #000; padding: 2px;">${state}</td>
      </tr>`;
  } else {
    headerRowsHtml = `
      <tr style="height: 12.2px;">
        <td colspan="${numCols}" style="border: 0.5px solid #000; font-weight: bold; padding: 2px;">Audit: ${auditType}</td>
      </tr>
      <tr style="height: 14.2px;">
        <td colspan="${numCols}" style="border: 0.5px solid #000; padding: 2px;">Branch: ${branchCode} — ${branchName}</td>
      </tr>`;
  }

  // Column headers with alternating colors
  const headerCells = columns.map((col, idx) => {
    const bgColor = idx < midpoint ? `rgb(${color1.r},${color1.g},${color1.b})` : `rgb(${color2.r},${color2.g},${color2.b})`;
    const headerText = col.header.replace(/\n/g, "<br/>");
    return `<th style="padding: 0; border: 0.5px solid #000; background: ${bgColor}; color: white; font-weight: bold; font-size: ${fontSize}px; height: ${headerRowHeight}px; vertical-align: middle;">${headerText}</th>`;
  }).join("");

  const srNoHeaderBg = `rgb(${color1.r},${color1.g},${color1.b})`;
  const headersHtml = `
    <tr style="height: ${headerRowHeight}px;">
      <th style="padding: 0; border: 0.5px solid #000; background: ${srNoHeaderBg}; color: white; font-weight: bold; font-size: ${fontSize}px; vertical-align: middle;">Sr<br/>No</th>
      ${headerCells}
    </tr>`;

  // Data rows
  const dataRowsHtml = rows.map((row, idx) => {
    const cells = columns.map(col => {
      let value = col.excelColumn ? String(row[col.excelColumn] || "") : "";
      if (col.dataType === "number") {
        value = formatNumber(row[col.excelColumn]);
      }
      const align = col.dataType === "number" ? "center" : "left";
      const bgColor = idx % 2 === 1 ? "#F2F2F2" : "#FFFFFF";
      return `<td style="padding: 0; border: 0.5px solid #999; background: ${bgColor}; text-align: ${align}; font-size: ${fontSize}px; height: ${rowHeight}px; vertical-align: middle;">${value}</td>`;
    }).join("");

    return `
      <tr style="height: ${rowHeight}px;">
        <td style="padding: 0; border: 0.5px solid #999; background: ${idx % 2 === 1 ? "#F2F2F2" : "#FFFFFF"}; text-align: center; font-size: ${fontSize}px; font-weight: bold; vertical-align: middle;">${idx + 1}</td>
        ${cells}
      </tr>`;
  }).join("");

  const isLandscape = pdfStyle.pageOrientation !== "portrait";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; }
    table { border-collapse: collapse; width: ${totalWidth}px; }
    @page { size: A4 ${isLandscape ? "landscape" : "portrait"}; margin: 15mm 50.2mm; }
  </style>
</head>
<body>
  <table>
    <thead>
      ${headerRowsHtml}
      ${headersHtml}
    </thead>
    <tbody>
      ${dataRowsHtml}
    </tbody>
  </table>
</body>
</html>`;
}

function readExcel(excelPath: string, colMap: Record<string, unknown>): { headers: string[]; rows: Record<string, unknown>[] } {
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

  return { headers: [], rows: data as Record<string, unknown>[] };
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
    const { columnMapping } = config;
    const branchGroupBy = columnMapping.branchGroupBy || "Branch Code";
    const branchNameCol = columnMapping.branchNameCol || "Branch Name";
    const stateCol = columnMapping.stateCol || "State";
    const columns = columnMapping.columns || [];

    const { rows } = readExcel(excelPath, columnMapping);

    if (rows.length === 0) {
      return { success: false, error: "Excel file is empty" };
    }

    const groups: Record<string, { rows: Record<string, unknown>[]; branchName: string; state: string }> = {};
    for (const row of rows) {
      const branchCode = String(row[branchGroupBy] || "Unknown").trim();
      if (!branchCode || branchCode === "None") {
        continue;
      }
      if (!groups[branchCode]) {
        groups[branchCode] = {
          rows: [],
          branchName: String(row[branchNameCol] || branchCode).trim(),
          state: String(row[stateCol] || "").trim(),
        };
      }
      groups[branchCode].rows.push(row);
    }

    const generatedFiles: GeneratedFile[] = [];
    const browser = await getBrowser();
    const page = await browser.newPage();

    const isLandscape = config.pdfStyle.pageOrientation !== "portrait";

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
        config
      );

      await page.setContent(html, { waitUntil: "networkidle0" });

      await page.pdf({
        path: filepath,
        format: "A4",
        landscape: isLandscape,
        printBackground: true,
        margin: { top: "48px", bottom: "15px", left: "50.2px", right: "50.2px" }
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