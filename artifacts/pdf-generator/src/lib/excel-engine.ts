export type InferredType = "text" | "number" | "date" | "boolean" | "mixed" | "empty";

export interface CellMetadata {
  sheetName: string;
  rowIndex: number;
  columnIndex: number;
  columnName: string;
  value: string | number | null;
}

export interface ColumnMeta {
  name: string;
  index: number;
  sheetName: string;
  sheetIndex: number;
  inferredType: InferredType;
  totalCount: number;
  nullCount: number;
  uniqueCount: number;
  fillRate: number;
  sampleValues: string[];
  numericStats?: {
    min: number;
    max: number;
    sum: number;
    avg: number;
  };
}

export interface SheetMeta {
  name: string;
  index: number;
  color: string;
  rowCount: number;
  columnCount: number;
  columns: ColumnMeta[];
}

export interface WorkbookData {
  fileName: string;
  fileSize: number;
  totalRows: number;
  sheets: SheetMeta[];
  sheetRows: Record<string, Record<string, string | number | null>[]>;
}

export const SHEET_COLORS = [
  "#4985E8", "#22C55E", "#EAB308", "#EF4444",
  "#A855F7", "#06B6D4", "#F97316", "#EC4899",
];

function inferType(values: (string | number | null)[]): InferredType {
  const nonNull = values.filter(v => v !== null && v !== "" && v !== undefined);
  if (nonNull.length === 0) return "empty";

  let numCount = 0;
  let dateCount = 0;
  let boolCount = 0;
  const boolWords = new Set(["true", "false", "yes", "no", "y", "n", "1", "0"]);

  for (const v of nonNull) {
    const s = String(v).trim();
    if (typeof v === "number") {
      numCount++;
    } else if (s !== "" && !isNaN(Number(s))) {
      numCount++;
    } else if (boolWords.has(s.toLowerCase())) {
      boolCount++;
    } else {
      const d = new Date(s);
      if (!isNaN(d.getTime()) && s.length >= 6 && /\d/.test(s)) dateCount++;
    }
  }

  const total = nonNull.length;
  if (numCount === total) return "number";
  if (dateCount >= total * 0.8) return "date";
  if (boolCount === total) return "boolean";
  if (numCount >= total * 0.7) return "number";
  if (numCount > 0 || dateCount > 0) return "mixed";
  return "text";
}

export async function parseWorkbook(file: File): Promise<WorkbookData> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });

  const sheetRows: Record<string, Record<string, string | number | null>[]> = {};
  const sheets: SheetMeta[] = [];
  let totalRows = 0;

  wb.SheetNames.forEach((sheetName: string, sheetIdx: number) => {
    const ws = wb.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
      raw: false,
    }) as (string | number | null)[][];

    if (rawData.length < 2) {
      sheetRows[sheetName] = [];
      sheets.push({
        name: sheetName,
        index: sheetIdx,
        color: SHEET_COLORS[sheetIdx % SHEET_COLORS.length],
        rowCount: 0,
        columnCount: 0,
        columns: [],
      });
      return;
    }

    const rawHeaders = rawData[0] as (string | number | null)[];
    const headerRow = rawHeaders.map(h => String(h ?? "").trim()).filter(Boolean);
    const headerIndices = rawHeaders.reduce<number[]>((acc, h, i) => {
      if (String(h ?? "").trim()) acc.push(i);
      return acc;
    }, []);

    const dataRows = rawData.slice(1);
    const rows: Record<string, string | number | null>[] = dataRows.map(row => {
      const obj: Record<string, string | number | null> = {};
      headerIndices.forEach((srcIdx, destIdx) => {
        const colName = headerRow[destIdx];
        const val = row[srcIdx] ?? null;
        obj[colName] = val === "" ? null : (val as string | number | null);
      });
      return obj;
    });

    sheetRows[sheetName] = rows;
    totalRows += rows.length;

    const columns: ColumnMeta[] = headerRow.map((colName, colIdx) => {
      const values = rows.map(r => r[colName] ?? null);
      const nonNullValues = values.filter(v => v !== null && v !== "");
      const nullCount = values.length - nonNullValues.length;
      const uniqueSet = new Set(nonNullValues.map(v => String(v)));
      const sampleValues = Array.from(uniqueSet).slice(0, 10).map(String);
      const type = inferType(values);
      const fillRate = values.length > 0
        ? Math.round(((values.length - nullCount) / values.length) * 100)
        : 0;

      let numericStats: ColumnMeta["numericStats"];
      if (type === "number" || type === "mixed") {
        const nums = nonNullValues
          .map(v => Number(String(v).replace(/,/g, "")))
          .filter(n => !isNaN(n));
        if (nums.length > 0) {
          const sum = nums.reduce((a, b) => a + b, 0);
          numericStats = {
            min: Math.min(...nums),
            max: Math.max(...nums),
            sum,
            avg: sum / nums.length,
          };
        }
      }

      return {
        name: colName,
        index: colIdx,
        sheetName,
        sheetIndex: sheetIdx,
        inferredType: type,
        totalCount: rows.length,
        nullCount,
        uniqueCount: uniqueSet.size,
        fillRate,
        sampleValues,
        numericStats,
      };
    });

    sheets.push({
      name: sheetName,
      index: sheetIdx,
      color: SHEET_COLORS[sheetIdx % SHEET_COLORS.length],
      rowCount: rows.length,
      columnCount: headerRow.length,
      columns,
    });
  });

  return { fileName: file.name, fileSize: file.size, totalRows, sheets, sheetRows };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function getCellValue(
  workbook: WorkbookData,
  sheetName: string,
  rowIndex: number,
  columnName: string,
): CellMetadata | null {
  const sheet = workbook.sheets.find(s => s.name === sheetName);
  if (!sheet) return null;
  const col = sheet.columns.find(c => c.name === columnName);
  if (!col) return null;
  const row = workbook.sheetRows[sheetName]?.[rowIndex];
  if (!row) return null;
  return {
    sheetName,
    rowIndex,
    columnIndex: col.index,
    columnName,
    value: row[columnName] ?? null,
  };
}

export const TYPE_COLORS: Record<InferredType, { bg: string; text: string; label: string }> = {
  text: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", label: "Text" },
  number: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", label: "Number" },
  date: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400", label: "Date" },
  boolean: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400", label: "Boolean" },
  mixed: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-400", label: "Mixed" },
  empty: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-500 dark:text-gray-400", label: "Empty" },
};
