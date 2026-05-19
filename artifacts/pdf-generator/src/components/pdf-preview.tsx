import { useMemo, useState } from "react";
import { Eye, Download, RefreshCw, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface ColumnConfig {
  id: string;
  header: string;
  excelColumn: string;
  sheetIndex?: number;
  width: number;
  dataType: "text" | "number" | "date" | "currency";
  alignment: "left" | "center" | "right";
  visible: boolean;
  headerColor?: string;
}

interface StylingConfig {
  pageOrientation: "portrait" | "landscape";
  headerColors: string[];
  fontSize: number;
  fontFamily: string;
  rowHeight: number;
  headerRowHeight: number;
  borderStyle: "solid" | "dashed" | "dotted" | "none";
  borderWidth: number;
  alternateRowColor: boolean;
  alternateRowColor2: string;
  includeSummary: boolean;
  summaryTitle: string;
}

interface TableConfig {
  columns: ColumnConfig[];
  groupByColumn: string;
  branchNameColumn: string;
  stateColumn: string;
}

interface PdfPreviewProps {
  table: TableConfig;
  styling: StylingConfig;
  sheetColors?: string[];
}

const SAMPLE_BRANCHES: { code: string; name: string; state: string; data: Record<string, string> }[] = [
  { code: "BR001", name: "Mumbai - Andheri", state: "Maharashtra", data: { col1: "P-001", col2: "CU001", col3: "45.5", col4: "45.2" } },
  { code: "BR001", name: "Mumbai - Andheri", state: "Maharashtra", data: { col1: "P-002", col2: "CU002", col3: "38.0", col4: "37.8" } },
  { code: "BR002", name: "Delhi - Connaught", state: "Delhi", data: { col1: "P-003", col2: "CU003", col3: "52.3", col4: "52.1" } },
  { code: "BR002", name: "Delhi - Connaught", state: "Delhi", data: { col1: "P-004", col2: "CU004", col3: "41.2", col4: "41.0" } },
  { code: "BR003", name: "Bangalore - MG Road", state: "Karnataka", data: { col1: "P-005", col2: "CU005", col3: "67.8", col4: "67.5" } },
];

const PAGE_SIZES = {
  portrait: { width: 210, height: 297 },
  landscape: { width: 297, height: 210 },
};

function generatePdfHtml(table: TableConfig, styling: StylingConfig, sheetColors: string[] = ["#FFFF00", "#4985E8"]): string {
  const visibleColumns = table.columns.filter(c => c.visible);
  const pageSize = PAGE_SIZES[styling.pageOrientation];
  const border = styling.borderStyle === "none" ? "none" : `${styling.borderWidth}px ${styling.borderStyle}`;

  let html = `
<!DOCTYPE html>
<html>
<head>
<style>
  @page { size: ${styling.pageOrientation}; margin: 10mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: ${styling.fontFamily}; font-size: ${styling.fontSize}px; }
  .page {
    width: ${pageSize.width}mm;
    min-height: ${pageSize.height}mm;
    background: white;
  }
  .header {
    background: linear-gradient(135deg, #333 0%, #555 100%);
    color: white;
    padding: 10px;
    text-align: center;
    margin-bottom: 5px;
  }
  .header h1 { font-size: 14px; margin-bottom: 2px; }
  .header p { font-size: 9px; opacity: 0.8; }
  table { width: 100%; border-collapse: collapse; }
  th {
    ${border ? `border: ${border}; border-color: #444;` : ''}
    padding: 3px 5px;
    text-align: center;
    color: white;
    font-weight: bold;
    height: ${styling.headerRowHeight}px;
  }
  td {
    ${border ? `border: ${border}; border-color: #ccc;` : ''}
    padding: 2px 5px;
    height: ${styling.rowHeight}px;
    vertical-align: middle;
  }
  .branch-header {
    background: #333;
    color: white;
    font-weight: bold;
    padding: 5px;
  }
  .summary-row {
    background: #f5f5f5;
    font-weight: bold;
  }
</style>
</head>
<body>`;

  const branches = groupByBranch(SAMPLE_BRANCHES, table.groupByColumn);

  branches.forEach((branch, branchIdx) => {
    if (branchIdx > 0) {
      html += '<div style="page-break-after: always;"></div>';
    }

    html += `
  <div class="page">
    <div class="header">
      <h1>Branch: ${branch[0].name}</h1>
      <p>State: ${branch[0].state} | ${branch.length} items | Branch Code: ${branch[0].code}</p>
    </div>
    <table>
      <thead>
        <tr>`;

    visibleColumns.forEach((col, colIdx) => {
      const color = col.headerColor || sheetColors[colIdx % sheetColors.length];
      html += `<th style="background-color: ${color}; width: ${col.width}px;">${col.header.replace(/\n/g, '<br/>')}</th>`;
    });

    html += `</tr></thead><tbody>`;

    branch.forEach((row, rowIdx) => {
      const bgColor = styling.alternateRowColor && rowIdx % 2 === 1 ? styling.alternateRowColor2 : "#fff";
      html += `<tr style="background-color: ${bgColor};">`;

      visibleColumns.forEach(col => {
        const value = row.data[col.excelColumn] || col.excelColumn ? "---" : "";
        const align = col.alignment;
        html += `<td style="text-align: ${align};">${value}</td>`;
      });

      html += `</tr>`;
    });

    if (styling.includeSummary) {
      html += `<tr class="summary-row">`;
      html += `<td colspan="${Math.min(visibleColumns.length, 2)}" style="text-align: right;">${styling.summaryTitle}:</td>`;
      html += `<td style="text-align: center;">${branch.length}</td>`;
      visibleColumns.slice(2).forEach(() => {
        html += `<td></td>`;
      });
      html += `</tr>`;
    }

    html += `</tbody></table></div>`;
  });

  html += `</body></html>`;
  return html;
}

function groupByBranch(data: typeof SAMPLE_BRANCHES, groupBy: string) {
  const groups: Record<string, typeof SAMPLE_BRANCHES> = {};
  data.forEach(row => {
    const key = row.code;
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  });
  return Object.values(groups);
}

export function PdfPreview({ table, styling, sheetColors }: PdfPreviewProps) {
  const [scale, setScale] = useState(0.7);
  const [previewMode, setPreviewMode] = useState<"pdf" | "design">("pdf");

  const html = useMemo(() => generatePdfHtml(table, styling, sheetColors), [table, styling, sheetColors]);

  const pageSize = PAGE_SIZES[styling.pageOrientation];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Live Preview</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={previewMode === "pdf" ? "default" : "outline"}
              size="sm"
              onClick={() => setPreviewMode("pdf")}
            >
              PDF View
            </Button>
            <Button
              variant={previewMode === "design" ? "default" : "outline"}
              size="sm"
              onClick={() => setPreviewMode("design")}
            >
              Design View
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between bg-muted/50 p-2 rounded-lg">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale(s => Math.max(0.3, s - 0.1))}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium w-16 text-center">{Math.round(scale * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale(s => Math.min(1.5, s + 0.1))}>
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">
            {styling.pageOrientation} • {pageSize.width} x {pageSize.height}mm
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
          </div>
        </div>

        {previewMode === "pdf" ? (
          <div className="overflow-auto max-h-[500px] bg-slate-200 p-4 rounded-lg">
            <div
              style={{
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                width: `${100 / scale}%`,
              }}
            >
              <iframe
                srcDoc={html}
                className="w-full bg-white shadow-lg"
                style={{
                  minHeight: `${pageSize.height * 3.78}px`,
                  border: "1px solid #ddd",
                }}
                title="PDF Preview"
              />
            </div>
          </div>
        ) : (
          <div className="overflow-auto max-h-[500px] bg-muted/30 p-4 rounded-lg">
            <div className="space-y-4">
              <div className="text-center">
                <div className="inline-block bg-gradient-to-r from-gray-700 to-gray-500 text-white px-6 py-3 rounded-t-lg">
                  <span className="font-bold">Branch: Sample Branch</span>
                  <div className="text-xs opacity-75">State: Maharashtra | 5 items</div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: `${table.columns.reduce((s, c) => s + (c.visible ? c.width : 0), 0)}px` }}>
                  <thead>
                    <tr>
                      {table.columns.filter(c => c.visible).map((col, i) => (
                        <th
                          key={col.id}
                          style={{
                            backgroundColor: col.headerColor || (sheetColors ? sheetColors[i % sheetColors.length] : "#4985E8"),
                            color: "white",
                            fontSize: `${styling.fontSize}px`,
                            fontFamily: styling.fontFamily,
                            fontWeight: "bold",
                            border: styling.borderStyle === "none" ? "none" : `${styling.borderWidth}px ${styling.borderStyle}`,
                            borderColor: "#444",
                            height: styling.headerRowHeight,
                            width: col.width,
                            minWidth: col.width,
                            padding: "4px 8px",
                            textAlign: "center",
                          }}
                        >
                          {col.header.replace(/\n/g, " / ")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SAMPLE_BRANCHES.slice(0, 3).map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        style={{
                          backgroundColor: styling.alternateRowColor && rowIdx % 2 === 1 ? styling.alternateRowColor2 : "#FFFFFF",
                        }}
                      >
                        {table.columns.filter(c => c.visible).map(col => (
                          <td
                            key={col.id}
                            style={{
                              fontSize: `${styling.fontSize}px`,
                              fontFamily: styling.fontFamily,
                              border: styling.borderStyle === "none" ? "none" : `${styling.borderWidth}px ${styling.borderStyle}`,
                              borderColor: "#ccc",
                              height: styling.rowHeight,
                              width: col.width,
                              minWidth: col.width,
                              padding: "4px 8px",
                              textAlign: col.alignment,
                            }}
                          >
                            {row.data[col.excelColumn] || "---"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {styling.includeSummary && (
                <div className="bg-slate-100 p-2 rounded border">
                  <span className="font-bold text-sm">{styling.summaryTitle}: 3 items</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-muted/30 p-3 rounded-lg">
          <h4 className="text-sm font-medium mb-2">Preview Info</h4>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Columns:</span>
              <span className="ml-2 font-medium">{table.columns.filter(c => c.visible).length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total Width:</span>
              <span className="ml-2 font-medium">{table.columns.filter(c => c.visible).reduce((s, c) => s + c.width, 0)}px</span>
            </div>
            <div>
              <span className="text-muted-foreground">Pages:</span>
              <span className="ml-2 font-medium">{Math.ceil(SAMPLE_BRANCHES.length / 3)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Font:</span>
              <span className="ml-2 font-medium">{styling.fontFamily} {styling.fontSize}px</span>
            </div>
            <div>
              <span className="text-muted-foreground">Row Height:</span>
              <span className="ml-2 font-medium">{styling.rowHeight}px</span>
            </div>
            <div>
              <span className="text-muted-foreground">Borders:</span>
              <span className="ml-2 font-medium">{styling.borderStyle} {styling.borderWidth}px</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}