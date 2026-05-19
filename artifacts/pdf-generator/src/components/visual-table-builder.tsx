import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { GripVertical, Eye, Settings } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

export type DataType = "text" | "number" | "date" | "currency";

export interface ColumnConfig {
  id: string;
  header: string;
  excelColumn: string;
  sheetIndex?: number;
  width: number;
  dataType: DataType;
  alignment: "left" | "center" | "right";
  visible: boolean;
  headerColor?: string;
}

export interface RowConfig {
  id: string;
  type: "data" | "header" | "summary";
  height: number;
  customHeight?: number;
}

export interface StylingConfig {
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

interface VisualTableBuilderProps {
  columns: ColumnConfig[];
  styling: StylingConfig;
  sheetColors?: string[];
  onColumnUpdate: (id: string, updates: Partial<ColumnConfig>) => void;
  onColumnMove: (from: number, to: number) => void;
  onColumnRemove: (id: string) => void;
  onColumnAdd: () => void;
  onStylingUpdate: (updates: Partial<StylingConfig>) => void;
  allHeaders?: string[];
}

const SAMPLE_DATA: Record<string, string>[] = [
  { col1: "Sample A", col2: "123", col3: "Data 1" },
  { col2: "Sample B", col3: "456", col4: "Data 2" },
  { col1: "Sample C", col2: "789", col3: "Data 3" },
];

export function VisualTableBuilder({
  columns,
  styling,
  sheetColors = ["#FFFF00", "#4985E8", "#4CAF50", "#FF5722"],
  onColumnUpdate,
  onColumnMove,
  onColumnRemove,
  onColumnAdd,
  onStylingUpdate,
  allHeaders = [],
}: VisualTableBuilderProps) {
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [resizingStartX, setResizingStartX] = useState(0);
  const [resizingStartWidth, setResizingStartWidth] = useState(0);
  const [activeTab, setActiveTab] = useState<"visual" | "settings">("visual");

  const tableRef = useRef<HTMLDivElement>(null);

  const border = styling.borderStyle === "none"
    ? "none"
    : `${styling.borderWidth}px ${styling.borderStyle}`;

  const totalWidth = useMemo(() => columns.reduce((sum, col) => sum + col.width, 0), [columns]);

  const handleResizeStart = useCallback((e: React.MouseEvent, columnId: string, startWidth: number, side: "left" | "right") => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(`${columnId}-${side}`);
    setResizingStartX(e.clientX);
    setResizingStartWidth(startWidth);
  }, []);

  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      const [colId, side] = resizingColumn.split("-");
      const diff = e.clientX - resizingStartX;
      const columnIndex = columns.findIndex(c => c.id === colId);

      if (columnIndex === -1) return;

      let newWidth = resizingStartWidth + (side === "right" ? diff : -diff);
      newWidth = Math.max(40, Math.min(400, newWidth));

      onColumnUpdate(colId, { width: Math.round(newWidth) });
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingColumn, resizingStartX, resizingStartWidth, columns, onColumnUpdate]);

  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Visual Table Builder</CardTitle>
            <CardDescription>Drag column borders to resize. Click headers to edit.</CardDescription>
          </div>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "visual" | "settings")}>
            <TabsList>
              <TabsTrigger value="visual">
                <Eye className="h-4 w-4 mr-1" /> Visual
              </TabsTrigger>
              <TabsTrigger value="settings">
                <Settings className="h-4 w-4 mr-1" /> Settings
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {activeTab === "visual" ? (
          <div className="space-y-4">
            <ScrollArea className="w-full overflow-x-auto border rounded-lg">
              <div
                ref={tableRef}
                className="min-w-full select-none"
                style={{ width: `${totalWidth + 100}px` }}
              >
                <table className="border-collapse" style={{ width: `${totalWidth}px` }}>
                  <thead>
                    <tr>
                      {columns.map((col, idx) => (
                        <th
                          key={col.id}
                          className="relative"
                          style={{
                            backgroundColor: col.headerColor || sheetColors[idx % sheetColors.length],
                            color: "white",
                            fontSize: `${styling.fontSize}px`,
                            fontFamily: styling.fontFamily,
                            fontWeight: "bold",
                            border: border,
                            borderColor: "#666",
                            width: col.width,
                            minWidth: col.width,
                            height: styling.headerRowHeight,
                            padding: "4px 8px",
                            textAlign: "center",
                            position: "relative",
                            userSelect: "none",
                          }}
                        >
                          <Input
                            value={col.header}
                            onChange={(e) => onColumnUpdate(col.id, { header: e.target.value })}
                            className="bg-transparent border-0 text-white text-center font-bold shadow-none h-6 px-1"
                            style={{ fontSize: `${styling.fontSize}px` }}
                          />

                          <div
                            className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-white/30 transition-colors"
                            onMouseDown={(e) => handleResizeStart(e, col.id, col.width, "right")}
                          />
                          {idx > 0 && (
                            <div
                              className="absolute top-0 left-0 w-2 h-full cursor-col-resize hover:bg-white/30 transition-colors"
                              onMouseDown={(e) => handleResizeStart(e, col.id, col.width, "left")}
                            />
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SAMPLE_DATA.map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        style={{
                          backgroundColor: styling.alternateRowColor && rowIdx % 2 === 1 ? styling.alternateRowColor2 : "#FFFFFF",
                        }}
                      >
                        {columns.map((col) => (
                          <td
                            key={col.id}
                            style={{
                              fontSize: `${styling.fontSize}px`,
                              fontFamily: styling.fontFamily,
                              border: border,
                              borderColor: "#999",
                              width: col.width,
                              minWidth: col.width,
                              height: styling.rowHeight,
                              padding: "4px 8px",
                              textAlign: col.alignment,
                              color: "#333",
                            }}
                          >
                            {col.excelColumn || "---"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                <span className="font-medium">{columns.length}</span> columns •
                Total width: <span className="font-medium">{totalWidth}px</span>
              </span>
              <span>
                Page: <span className="font-medium capitalize">{styling.pageOrientation}</span> •
                Font: <span className="font-medium">{styling.fontFamily} {styling.fontSize}px</span>
              </span>
            </div>

            <div className="border rounded-lg p-4 bg-muted/30">
              <h4 className="text-sm font-medium mb-3">Quick Settings</h4>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs">Row Height</Label>
                  <Input
                    type="number"
                    value={styling.rowHeight}
                    onChange={(e) => onStylingUpdate({ rowHeight: Number(e.target.value) })}
                    min={10}
                    max={100}
                    className="h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs">Header Height</Label>
                  <Input
                    type="number"
                    value={styling.headerRowHeight}
                    onChange={(e) => onStylingUpdate({ headerRowHeight: Number(e.target.value) })}
                    min={10}
                    max={100}
                    className="h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs">Font Size</Label>
                  <Input
                    type="number"
                    value={styling.fontSize}
                    onChange={(e) => onStylingUpdate({ fontSize: Number(e.target.value) })}
                    min={6}
                    max={24}
                    className="h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs">Border Width</Label>
                  <Input
                    type="number"
                    value={styling.borderWidth}
                    onChange={(e) => onStylingUpdate({ borderWidth: Number(e.target.value) })}
                    min={0}
                    max={5}
                    step={0.1}
                    className="h-8"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label>Page Orientation</Label>
                  <div className="flex gap-2 mt-1">
                    <Button
                      variant={styling.pageOrientation === "portrait" ? "default" : "outline"}
                      size="sm"
                      onClick={() => onStylingUpdate({ pageOrientation: "portrait" })}
                    >
                      Portrait
                    </Button>
                    <Button
                      variant={styling.pageOrientation === "landscape" ? "default" : "outline"}
                      size="sm"
                      onClick={() => onStylingUpdate({ pageOrientation: "landscape" })}
                    >
                      Landscape
                    </Button>
                  </div>
                </div>
                <div>
                  <Label>Font Family</Label>
                  <select
                    value={styling.fontFamily}
                    onChange={(e) => onStylingUpdate({ fontFamily: e.target.value })}
                    className="w-full h-10 px-3 rounded-md border bg-background"
                  >
                    <option value="Arial">Arial</option>
                    <option value="Helvetica">Helvetica</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Courier New">Courier New</option>
                    <option value="Verdana">Verdana</option>
                    <option value="Georgia">Georgia</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label>Header Colors</Label>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {styling.headerColors.map((color, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => {
                            const colors = [...styling.headerColors];
                            colors[i] = e.target.value;
                            onStylingUpdate({ headerColors: colors });
                          }}
                          className="w-8 h-8 rounded border cursor-pointer"
                        />
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onStylingUpdate({ headerColors: [...styling.headerColors, "#000000"] })}
                    >
                      + Add
                    </Button>
                  </div>
                </div>
                <div>
                  <Label>Border Style</Label>
                  <div className="flex gap-2 mt-1">
                    {["solid", "dashed", "dotted", "none"].map((style) => (
                      <Button
                        key={style}
                        variant={styling.borderStyle === style ? "default" : "outline"}
                        size="sm"
                        onClick={() => onStylingUpdate({ borderStyle: style as "solid" | "dashed" | "dotted" | "none" })}
                      >
                        {style}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between py-4 border-t">
              <div>
                <Label>Alternate Row Colors</Label>
                <p className="text-sm text-muted-foreground">Use alternating background colors</p>
              </div>
              <button
                onClick={() => onStylingUpdate({ alternateRowColor: !styling.alternateRowColor })}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  styling.alternateRowColor ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    styling.alternateRowColor ? "left-7" : "left-1"
                  }`}
                />
              </button>
            </div>

            {styling.alternateRowColor && (
              <div className="flex items-center gap-4">
                <Label>Alternate Color</Label>
                <input
                  type="color"
                  value={styling.alternateRowColor2}
                  onChange={(e) => onStylingUpdate({ alternateRowColor2: e.target.value })}
                  className="w-10 h-10 rounded border cursor-pointer"
                />
                <Input
                  value={styling.alternateRowColor2}
                  onChange={(e) => onStylingUpdate({ alternateRowColor2: e.target.value })}
                  className="w-28"
                />
              </div>
            )}

            <div className="border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Include Summary Section</Label>
                  <p className="text-sm text-muted-foreground">Add a summary row at the end of each branch</p>
                </div>
                <button
                  onClick={() => onStylingUpdate({ includeSummary: !styling.includeSummary })}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    styling.includeSummary ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      styling.includeSummary ? "left-7" : "left-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}