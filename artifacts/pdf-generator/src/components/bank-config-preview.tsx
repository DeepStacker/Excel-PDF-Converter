import { useEffect, useRef, useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ColumnConfig {
  header: string;
  excelColumn: string | null;
  width: number;
  dataType: "text" | "number";
  headerColor?: string | null;
}

interface PdfStyle {
  pageOrientation: "portrait" | "landscape";
  headerColor1: string;
  headerColor2: string;
  fontSize: number;
  fontFamily: "Arial" | "Helvetica" | "Times New Roman" | "Courier" | "Verdana" | "Georgia";
  rowHeight: number;
  headerRowHeight: number;
  borderStyle: "solid" | "dashed" | "dotted" | "none";
  borderWidth: number;
  alternateRowColor: boolean;
  alternateRowColor2: string;
}

interface ColumnMapping {
  branchGroupBy: string;
  branchNameCol: string;
  stateCol: string;
  columns: ColumnConfig[];
}

interface Config {
  columnMapping: ColumnMapping;
  pdfStyle: PdfStyle;
}

const SAMPLE_DATA: Record<string, string>[] = [
  { BranchCode: "BR001", BranchName: "Mumbai - Andheri", State: "Maharashtra", Prospectno: "P-001", CUID: "CU001", "Tare Weight": "45.5", "Tare Weight as per Audit": "45.2" },
  { BranchCode: "BR002", BranchName: "Delhi - Connaught", State: "Delhi", Prospectno: "P-002", CUID: "CU002", "Tare Weight": "38.0", "Tare Weight as per Audit": "37.8" },
  { BranchCode: "BR003", BranchName: "Bangalore - MG Road", State: "Karnataka", Prospectno: "P-003", CUID: "CU003", "Tare Weight": "52.3", "Tare Weight as per Audit": "52.1" },
];

function generatePreviewHtml(config: Config): string {
  const { columnMapping, pdfStyle } = config;
  const { columns } = columnMapping;

  const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);
  const isLandscape = pdfStyle.pageOrientation === "landscape";
  const pageWidth = isLandscape ? 297 : 210;

  const border = pdfStyle.borderStyle === "none" ? "none" : `${pdfStyle.borderWidth}px ${pdfStyle.borderStyle}`;
  const rowBg = pdfStyle.alternateRowColor ? pdfStyle.alternateRowColor2 : "#FFFFFF";

  const colWidths = columns.map(c => c.width);
  const headerRows = columns.map(c => c.header);

  const headersHtml = headerRows.map((h, i) => {
    const color = i % 2 === 0 ? pdfStyle.headerColor1 : pdfStyle.headerColor2;
    return `<th style="
      background-color: ${color};
      color: white;
      padding: 4px 8px;
      font-size: ${pdfStyle.fontSize}px;
      font-family: ${pdfStyle.fontFamily}, sans-serif;
      font-weight: bold;
      border: ${border} #666;
      text-align: center;
      height: ${pdfStyle.headerRowHeight}px;
      width: ${colWidths[i]}px;
      box-sizing: border-box;
      word-wrap: break-word;
    ">${h.replace(/\n/g, "<br/>")}</th>`;
  }).join("");

  const rowsHtml = SAMPLE_DATA.map((row, rowIdx) => {
    const bgColor = pdfStyle.alternateRowColor && rowIdx % 2 === 1 ? rowBg : "#FFFFFF";
    const cellsHtml = columns.map(col => {
      const value = col.excelColumn ? String(row[col.excelColumn] ?? "") : "---";
      const align = col.dataType === "number" ? "right" : "left";
      return `<td style="
        background-color: ${bgColor};
        padding: 4px 8px;
        font-size: ${pdfStyle.fontSize}px;
        font-family: ${pdfStyle.fontFamily}, sans-serif;
        border: ${border} #999;
        height: ${pdfStyle.rowHeight}px;
        text-align: ${align};
        box-sizing: border-box;
        vertical-align: middle;
      ">${value}</td>`;
    }).join("");
    return `<tr>${cellsHtml}</tr>`;
  }).join("");

  return `
<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${pageWidth}mm;
    font-family: ${pdfStyle.fontFamily}, sans-serif;
  }
  table {
    width: ${tableWidth}px;
    border-collapse: collapse;
    font-size: ${pdfStyle.fontSize}px;
  }
</style>
</head>
<body>
<table>
  <thead><tr>${headersHtml}</tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>
</body>
</html>`;
}

interface BankConfigPreviewProps {
  config: Config;
}

export function BankConfigPreview({ config }: BankConfigPreviewProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "design">("preview");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const html = useMemo(() => generatePreviewHtml(config), [config]);

  useEffect(() => {
    if (activeTab === "preview" && iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
    }
  }, [html, activeTab]);

  const totalWidth = config.columnMapping.columns.reduce((s, c) => s + c.width, 0);
  const border = config.pdfStyle.borderStyle === "none" ? "none" : `${config.pdfStyle.borderWidth}px ${config.pdfStyle.borderStyle}`;
  const rowBg = config.pdfStyle.alternateRowColor ? config.pdfStyle.alternateRowColor2 : "#FFFFFF";

  return (
    <Card className="shadow-sm border-muted/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Live Preview</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="bg-muted/30 border-y">
          <div className="flex border-b">
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium ${activeTab === "preview" ? "bg-background border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveTab("preview")}
            >
              Preview
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium ${activeTab === "design" ? "bg-background border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveTab("design")}
            >
              Table Design
            </button>
          </div>

          {activeTab === "preview" ? (
            <div className="p-4 overflow-auto max-h-[500px] bg-white">
              <iframe
                ref={iframeRef}
                className="w-full border border-muted"
                style={{ minHeight: "300px", transform: "scale(0.9)", transformOrigin: "top left", width: "111%" }}
                title="PDF Preview"
              />
            </div>
          ) : (
            <div className="p-4 overflow-auto">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: `${totalWidth}px` }}>
                  <thead>
                    <tr>
                      {config.columnMapping.columns.map((col, i) => (
                        <th
                          key={i}
                          style={{
                            backgroundColor: i % 2 === 0 ? config.pdfStyle.headerColor1 : config.pdfStyle.headerColor2,
                            color: "white",
                            padding: "8px",
                            fontSize: `${config.pdfStyle.fontSize}px`,
                            fontFamily: `${config.pdfStyle.fontFamily}, sans-serif`,
                            fontWeight: "bold",
                            border: border,
                            textAlign: "center",
                            height: `${config.pdfStyle.headerRowHeight}px`,
                            width: `${col.width}px`,
                            minWidth: `${col.width}px`,
                          }}
                        >
                          <div>{col.header.replace(/\n/g, " / ")}</div>
                          <div className="text-xs font-normal opacity-75">
                            {col.width}px • {col.dataType}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SAMPLE_DATA.map((row, rowIdx) => (
                      <tr key={rowIdx} style={{ backgroundColor: config.pdfStyle.alternateRowColor && rowIdx % 2 === 1 ? rowBg : "#FFFFFF" }}>
                        {config.columnMapping.columns.map((col, colIdx) => (
                          <td
                            key={colIdx}
                            style={{
                              padding: "8px",
                              fontSize: `${config.pdfStyle.fontSize}px`,
                              fontFamily: `${config.pdfStyle.fontFamily}, sans-serif`,
                              border: border,
                              height: `${config.pdfStyle.rowHeight}px`,
                              width: `${col.width}px`,
                              minWidth: `${col.width}px`,
                              textAlign: col.dataType === "number" ? "right" : "left",
                            }}
                          >
                            {col.excelColumn ? (row[col.excelColumn] ?? "-") : "---"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-sm text-muted-foreground space-y-1">
                <p><strong>Page:</strong> {config.pdfStyle.pageOrientation} ({config.pdfStyle.pageOrientation === "landscape" ? "297 x 210mm" : "210 x 297mm"})</p>
                <p><strong>Font:</strong> {config.pdfStyle.fontSize}px {config.pdfStyle.fontFamily}</p>
                <p><strong>Borders:</strong> {config.pdfStyle.borderStyle} ({config.pdfStyle.borderWidth}px)</p>
                <p><strong>Alt rows:</strong> {config.pdfStyle.alternateRowColor ? `On (${config.pdfStyle.alternateRowColor2})` : "Off"}</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}