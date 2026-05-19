import { useState, useRef, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, GripVertical } from "lucide-react";

interface ColumnConfig {
  header: string;
  excelColumn: string | null;
  width: number;
  dataType: "text" | "number";
}

interface VisualColumnBuilderProps {
  columns: ColumnConfig[];
  onColumnChange: (index: number, field: keyof ColumnConfig, value: string | number | null) => void;
  onWidthChange: (index: number, width: number) => void;
  onRemove: (index: number) => void;
  pdfStyle: {
    headerColor1: string;
    headerColor2: string;
    fontSize: number;
    fontFamily: string;
    borderStyle: string;
    borderWidth: number;
    alternateRowColor: boolean;
    alternateRowColor2: string;
  };
}

const SAMPLE_DATA: Record<string, string>[] = [
  { sample1: "Data 1", sample2: "Data 2", sample3: "123" },
  { sample1: "Info A", sample2: "Info B", sample3: "456" },
];

export function VisualColumnBuilder({
  columns,
  onColumnChange,
  onWidthChange,
  onRemove,
  pdfStyle,
}: VisualColumnBuilderProps) {
  const [resizingIndex, setResizingIndex] = useState<number | null>(null);
  const [resizingField, setResizingField] = useState<"left" | "right" | null>(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);

  const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
  const border = pdfStyle.borderStyle === "none" ? "none" : `${pdfStyle.borderWidth}px ${pdfStyle.borderStyle}`;
  const rowBg = pdfStyle.alternateRowColor ? pdfStyle.alternateRowColor2 : "#FFFFFF";

  const handleMouseDown = useCallback((e: React.MouseEvent, index: number, field: "left" | "right") => {
    e.preventDefault();
    e.stopPropagation();
    setResizingIndex(index);
    setResizingField(field);
    setStartX(e.clientX);
    setStartWidth(columns[field === "left" ? index - 1 : index].width);
  }, [columns]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (resizingIndex === null || resizingField === null) return;

    const diff = e.clientX - startX;
    const newWidth = Math.max(40, Math.min(400, startWidth + diff));

    if (resizingField === "right") {
      onWidthChange(resizingIndex, Math.round(newWidth));
    } else if (resizingIndex > 0) {
      onWidthChange(resizingIndex - 1, Math.round(newWidth));
    }
  }, [resizingIndex, resizingField, startX, startWidth, onWidthChange]);

  const handleMouseUp = useCallback(() => {
    setResizingIndex(null);
    setResizingField(null);
  }, []);

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Drag column borders to resize. Click headers to edit inline.
      </div>

      <div
        ref={tableRef}
        className="border rounded-lg overflow-hidden"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <Table style={{ width: totalWidth, minWidth: totalWidth }}>
          <TableHeader>
            <TableRow>
              {columns.map((col, i) => (
                <TableHead
                  key={i}
                  style={{
                    backgroundColor: i % 2 === 0 ? pdfStyle.headerColor1 : pdfStyle.headerColor2,
                    color: "white",
                    fontSize: `${pdfStyle.fontSize}px`,
                    fontFamily: pdfStyle.fontFamily,
                    border: border,
                    width: col.width,
                    minWidth: col.width,
                    maxWidth: col.width,
                    height: 40,
                    padding: 0,
                    position: "relative",
                    userSelect: "none",
                  }}
                >
                  <div className="flex flex-col h-full">
                    <Input
                      value={col.header}
                      onChange={(e) => onColumnChange(i, "header", e.target.value)}
                      className="h-full bg-transparent border-0 text-white placeholder:text-white/50 text-center font-bold shadow-none focus-visible:ring-1 focus-visible:ring-white/50"
                      style={{ fontSize: `${pdfStyle.fontSize}px` }}
                    />
                  </div>

                  <div className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-white/20" onMouseDown={(e) => handleMouseDown(e, i, "right")} />

                  {i > 0 && (
                    <div className="absolute top-0 left-0 w-2 h-full cursor-col-resize hover:bg-white/20" onMouseDown={(e) => handleMouseDown(e, i, "left")} />
                  )}
                </TableHead>
              ))}
              <TableHead
                style={{
                  width: 40,
                  minWidth: 40,
                  backgroundColor: "#f5f5f5",
                  border: border,
                }}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {SAMPLE_DATA.map((row, rowIdx) => (
              <TableRow
                key={rowIdx}
                style={{ backgroundColor: pdfStyle.alternateRowColor && rowIdx % 2 === 1 ? rowBg : "#FFFFFF" }}
              >
                {columns.map((col, colIdx) => (
                  <TableCell
                    key={colIdx}
                    style={{
                      fontSize: `${pdfStyle.fontSize}px`,
                      fontFamily: pdfStyle.fontFamily,
                      border: border,
                      width: col.width,
                      minWidth: col.width,
                      maxWidth: col.width,
                      height: 32,
                      padding: "4px 8px",
                      textAlign: col.dataType === "number" ? "right" : "left",
                    }}
                  >
                    {col.excelColumn || "---"}
                  </TableCell>
                ))}
                <TableCell style={{ width: 40, minWidth: 40, backgroundColor: "#f5f5f5", border: border }} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="text-xs text-muted-foreground">
        <span className="font-medium">{columns.length}</span> columns • Total width: <span className="font-medium">{totalWidth}px</span>
      </div>
    </div>
  );
}