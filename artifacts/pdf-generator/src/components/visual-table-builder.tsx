import { useState, useRef, useEffect, useCallback } from "react";
import { GripVertical, Trash2, Plus, Eye, EyeOff, MoveHorizontal, ChevronLeft, ChevronRight, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

export type DataType = "text" | "number" | "date" | "currency";
export type Alignment = "left" | "center" | "right";

export interface ColumnConfig {
  id: string;
  header: string;
  excelColumn: string;
  sheetIndex?: number;
  width: number;
  dataType: DataType;
  alignment: Alignment;
  visible: boolean;
  headerColor?: string;
  isBlank?: boolean;
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
  sheetColors: string[];
  allHeaders: string[];
  onColumnUpdate: (id: string, updates: Partial<ColumnConfig>) => void;
  onColumnMove: (from: number, to: number) => void;
  onColumnRemove: (id: string) => void;
  onColumnAdd: (blank?: boolean) => void;
  onStylingUpdate: (updates: Partial<StylingConfig>) => void;
}

const SAMPLE_DATA: Record<string, string>[] = [
  { col1: "P-001", col2: "CU-2345", col3: "45.5", col4: "45.2", col5: "18K Above", col6: "" },
  { col1: "P-002", col2: "CU-6789", col3: "38.0", col4: "38.0", col5: "18K Above", col6: "" },
  { col1: "P-003", col2: "CU-1122", col3: "52.3", col4: "52.1", col5: "Below 18K", col6: "" },
  { col1: "P-004", col2: "CU-3344", col3: "19.5", col4: "19.5", col5: "18K Above", col6: "" },
];

const PAGE_USABLE_WIDTH = { portrait: 525, landscape: 770 };

export function VisualTableBuilder({
  columns, styling, sheetColors, allHeaders,
  onColumnUpdate, onColumnMove, onColumnRemove, onColumnAdd, onStylingUpdate,
}: VisualTableBuilderProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragColIdx, setDragColIdx] = useState<number | null>(null);
  const [dropColIdx, setDropColIdx] = useState<number | null>(null);
  
  const [resizeCol, setResizeCol] = useState<{ id: string; startX: number; startWidth: number } | null>(null);
  const [resizeRowHeader, setResizeRowHeader] = useState<{ startY: number; startHeight: number } | null>(null);
  const [resizeRowData, setResizeRowData] = useState<{ startY: number; startHeight: number } | null>(null);

  const tableContainerRef = useRef<HTMLDivElement>(null);

  const selectedCol = columns.find(c => c.id === selectedId) ?? null;
  const visibleCols = columns.filter(c => c.visible);
  const totalWidth = visibleCols.reduce((s, c) => s + c.width, 0) + 30;
  const pageWidth = PAGE_USABLE_WIDTH[styling.pageOrientation];
  const widthOk = totalWidth <= pageWidth;

  const getColColor = useCallback((col: ColumnConfig, idx: number) => {
    if (col.headerColor) return col.headerColor;
    return sheetColors[idx % Math.max(sheetColors.length, 1)] || "#4985E8";
  }, [sheetColors]);

  const border = styling.borderStyle === "none" ? "none"
    : `${styling.borderWidth}px ${styling.borderStyle} #888`;

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (resizeCol) {
        const diff = e.clientX - resizeCol.startX;
        const nw = Math.max(30, Math.min(500, resizeCol.startWidth + diff));
        onColumnUpdate(resizeCol.id, { width: Math.round(nw) });
      }
      if (resizeRowHeader) {
        const diff = e.clientY - resizeRowHeader.startY;
        const nh = Math.max(16, Math.min(120, resizeRowHeader.startHeight + diff));
        onStylingUpdate({ headerRowHeight: Math.round(nh) });
      }
      if (resizeRowData) {
        const diff = e.clientY - resizeRowData.startY;
        const nh = Math.max(14, Math.min(100, resizeRowData.startHeight + diff));
        onStylingUpdate({ rowHeight: Math.round(nh) });
      }
    };
    const onUp = () => {
      setResizeCol(null);
      setResizeRowHeader(null);
      setResizeRowData(null);
    };
    if (resizeCol || resizeRowHeader || resizeRowData) {
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizeCol, resizeRowHeader, resizeRowData, onColumnUpdate, onStylingUpdate]);

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    e.dataTransfer.effectAllowed = "move";
    setDragColIdx(idx);
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropColIdx(idx);
  };
  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragColIdx !== null && dragColIdx !== idx) {
      onColumnMove(dragColIdx, idx);
    }
    setDragColIdx(null);
    setDropColIdx(null);
  };
  const handleDragEnd = () => {
    setDragColIdx(null);
    setDropColIdx(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Total width:</span>
            <span className={`font-semibold ${widthOk ? "text-green-600" : "text-red-500"}`}>
              {totalWidth}pt
            </span>
            <span className="text-muted-foreground">/ {pageWidth}pt ({styling.pageOrientation})</span>
          </div>
          {!widthOk && (
            <Badge variant="destructive" className="text-xs">
              {totalWidth - pageWidth}pt over — reduce widths or switch to landscape
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onColumnAdd(false)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> From Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => onColumnAdd(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Blank Column
          </Button>
        </div>
      </div>

      <div
        ref={tableContainerRef}
        className="overflow-x-auto border rounded-xl bg-white shadow-sm"
        style={{ cursor: resizeCol ? "col-resize" : resizeRowHeader || resizeRowData ? "row-resize" : "default" }}
      >
        <div style={{ minWidth: `${totalWidth + 60}px` }}>
          <table className="border-collapse" style={{ width: `${totalWidth}px`, tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 30 }} />
              {visibleCols.map(col => <col key={col.id} style={{ width: col.width }} />)}
            </colgroup>
            <thead>
              <tr>
                <th
                  style={{
                    background: "#666",
                    color: "white",
                    fontSize: `${styling.fontSize}px`,
                    fontFamily: styling.fontFamily,
                    fontWeight: "bold",
                    border,
                    height: styling.headerRowHeight,
                    textAlign: "center",
                    padding: "2px 4px",
                    position: "relative",
                    userSelect: "none",
                  }}
                >
                  #
                  <div
                    className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-blue-400/40 transition-colors z-10"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setResizeRowHeader({ startY: e.clientY, startHeight: styling.headerRowHeight });
                    }}
                  />
                </th>
                {visibleCols.map((col, colIdx) => {
                  const bg = getColColor(col, colIdx);
                  const isDragging = dragColIdx === colIdx;
                  const isDropTarget = dropColIdx === colIdx && dragColIdx !== null && dragColIdx !== colIdx;
                  const isSelected = selectedId === col.id;
                  return (
                    <th
                      key={col.id}
                      draggable
                      onClick={() => setSelectedId(isSelected ? null : col.id)}
                      onDragStart={(e) => handleDragStart(e, colIdx)}
                      onDragOver={(e) => handleDragOver(e, colIdx)}
                      onDrop={(e) => handleDrop(e, colIdx)}
                      onDragEnd={handleDragEnd}
                      style={{
                        backgroundColor: bg,
                        color: "white",
                        fontSize: `${styling.fontSize}px`,
                        fontFamily: styling.fontFamily,
                        fontWeight: "bold",
                        border,
                        height: styling.headerRowHeight,
                        textAlign: "center",
                        padding: "2px 4px",
                        position: "relative",
                        userSelect: "none",
                        cursor: "pointer",
                        opacity: isDragging ? 0.4 : 1,
                        boxShadow: isSelected ? `inset 0 0 0 2px white` : isDropTarget ? `inset 0 0 0 3px #60a5fa` : undefined,
                        transition: "box-shadow 0.15s",
                        overflow: "hidden",
                      }}
                    >
                      <div className="flex items-center justify-center h-full gap-1 px-1">
                        <GripVertical className="h-3 w-3 shrink-0 opacity-70" />
                        <span className="truncate text-center leading-tight" style={{ fontSize: `${Math.max(8, styling.fontSize - 1)}px` }}>
                          {col.header.replace(/\\n/g, " / ").replace(/\n/g, " / ") || <em>no header</em>}
                        </span>
                      </div>
                      {col.isBlank && (
                        <div className="absolute top-0.5 right-0.5 text-[9px] bg-white/30 rounded px-0.5">blank</div>
                      )}
                      <div
                        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-white/40 transition-colors"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setResizeCol({ id: col.id, startX: e.clientX, startWidth: col.width });
                        }}
                      />
                      <div
                        className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-blue-400/40 transition-colors z-10"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setResizeRowHeader({ startY: e.clientY, startHeight: styling.headerRowHeight });
                        }}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {SAMPLE_DATA.map((row, rowIdx) => {
                const rowKeys = Object.keys(row);
                const bg = styling.alternateRowColor && rowIdx % 2 === 1 ? styling.alternateRowColor2 : "#FFFFFF";
                return (
                  <tr key={rowIdx} style={{ backgroundColor: bg }}>
                    <td style={{
                      border, color: "#999", textAlign: "center", padding: "2px 4px",
                      fontSize: `${styling.fontSize - 1}px`, fontFamily: styling.fontFamily,
                      height: styling.rowHeight, position: "relative"
                    }}>
                      {rowIdx + 1}
                      {rowIdx === SAMPLE_DATA.length - 1 && (
                        <div
                          className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-blue-400/40 transition-colors z-10"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setResizeRowData({ startY: e.clientY, startHeight: styling.rowHeight });
                          }}
                        />
                      )}
                    </td>
                    {visibleCols.map((col, colIdx) => {
                      const sampleKey = rowKeys[colIdx] || rowKeys[0];
                      const val = col.isBlank ? "" : (row[sampleKey] || "");
                      return (
                        <td key={col.id} style={{
                          border, fontSize: `${styling.fontSize}px`, fontFamily: styling.fontFamily,
                          height: styling.rowHeight, textAlign: col.alignment, padding: "2px 6px",
                          color: "#333", overflow: "hidden", whiteSpace: "nowrap",
                          verticalAlign: "middle", position: "relative"
                        }}>
                          {val}
                          {rowIdx === SAMPLE_DATA.length - 1 && (
                            <div
                              className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-blue-400/40 transition-colors z-10"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setResizeRowData({ startY: e.clientY, startHeight: styling.rowHeight });
                              }}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {styling.includeSummary && (
                <tr style={{ backgroundColor: "#f0f0f0", fontWeight: "bold" }}>
                  <td colSpan={Math.min(3, visibleCols.length + 1)} style={{
                    border, fontSize: `${styling.fontSize}px`, fontFamily: styling.fontFamily,
                    height: styling.rowHeight, textAlign: "right", padding: "2px 6px", color: "#333"
                  }}>
                    {styling.summaryTitle}: {SAMPLE_DATA.length}
                  </td>
                  {visibleCols.slice(2).map((col) => (
                    <td key={col.id} style={{ border, height: styling.rowHeight }} />
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">All Columns ({columns.length})</Label>
            <span className="text-xs text-muted-foreground">Drag ≡ to reorder</span>
          </div>
          <ScrollArea className="h-56 border rounded-lg">
            <div className="p-2 space-y-1">
              {columns.map((col, idx) => (
                <div
                  key={col.id}
                  className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                    selectedId === col.id ? "border-primary bg-primary/5" : "border-transparent hover:border-muted hover:bg-muted/30"
                  } ${!col.visible ? "opacity-50" : ""}`}
                  onClick={() => setSelectedId(selectedId === col.id ? null : col.id)}
                >
                  <div className="cursor-grab text-muted-foreground shrink-0">
                    <GripVertical className="h-4 w-4" />
                  </div>
                  <div
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: getColColor(col, idx) }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {col.header.replace(/\\n/g, " / ").replace(/\n/g, " / ") || "(no header)"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {col.isBlank ? "Blank / Manual entry" : `Excel: ${col.excelColumn || "(none)"}`} • {col.width}pt
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      className="p-1 rounded hover:bg-muted transition-colors"
                      onClick={(e) => { e.stopPropagation(); onColumnUpdate(col.id, { visible: !col.visible }); }}
                    >
                      {col.visible ? <Eye className="h-3.5 w-3.5 text-muted-foreground" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    <button
                      className="p-1 rounded hover:bg-destructive/10 transition-colors"
                      onClick={(e) => { e.stopPropagation(); onColumnRemove(col.id); if (selectedId === col.id) setSelectedId(null); }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="border rounded-lg p-4 bg-muted/20 space-y-4">
          {selectedCol ? (
            <>
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold text-foreground">Edit Column</Label>
                <Badge variant="outline" className="text-xs">{selectedCol.isBlank ? "Blank" : "Excel"}</Badge>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Header Text (use \n for line break)</Label>
                <textarea
                  value={selectedCol.header}
                  onChange={(e) => onColumnUpdate(selectedCol.id, { header: e.target.value })}
                  className="w-full h-16 text-sm border rounded-md px-3 py-2 resize-none bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Column header text"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {selectedCol.isBlank ? "Source (Blank = manual entry in audit)" : "Excel Column"}
                </Label>
                <Select
                  value={selectedCol.isBlank ? "__blank__" : (selectedCol.excelColumn || "__blank__")}
                  onValueChange={(v) => onColumnUpdate(selectedCol.id, {
                    isBlank: v === "__blank__",
                    excelColumn: v === "__blank__" ? "" : v,
                  })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__blank__">Blank (Manual entry)</SelectItem>
                    {allHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Width: {selectedCol.width}pt</Label>
                <Slider
                  min={30} max={500} step={5}
                  value={[selectedCol.width]}
                  onValueChange={([v]) => onColumnUpdate(selectedCol.id, { width: v })}
                  className="py-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Data Type</Label>
                  <Select
                    value={selectedCol.dataType}
                    onValueChange={(v) => onColumnUpdate(selectedCol.id, { dataType: v as DataType })}
                  >
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="currency">Currency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Alignment</Label>
                  <div className="flex gap-1">
                    {(["left", "center", "right"] as Alignment[]).map((a) => {
                      const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
                      return (
                        <button
                          key={a}
                          onClick={() => onColumnUpdate(selectedCol.id, { alignment: a })}
                          className={`flex-1 p-1.5 rounded border transition-colors ${selectedCol.alignment === a ? "bg-primary border-primary text-primary-foreground" : "hover:bg-muted"}`}
                        >
                          <Icon className="h-3.5 w-3.5 mx-auto" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Header Color Override</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selectedCol.headerColor || getColColor(selectedCol, columns.indexOf(selectedCol))}
                      onChange={(e) => onColumnUpdate(selectedCol.id, { headerColor: e.target.value })}
                      className="w-8 h-8 rounded border cursor-pointer"
                    />
                    {selectedCol.headerColor && (
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                        onClick={() => onColumnUpdate(selectedCol.id, { headerColor: undefined })}
                      >
                        reset
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Visible in PDF</Label>
                  <Switch
                    checked={selectedCol.visible}
                    onCheckedChange={(v) => onColumnUpdate(selectedCol.id, { visible: v })}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center py-8 text-muted-foreground">
              <MoveHorizontal className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm font-medium">Click any column above</p>
              <p className="text-xs mt-1">to edit its settings here</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6 p-3 bg-muted/30 rounded-lg text-sm border">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-muted-foreground">Header height: </span>
            <span className="font-medium">{styling.headerRowHeight}pt</span>
          </div>
          <div>
            <span className="text-muted-foreground">Row height: </span>
            <span className="font-medium">{styling.rowHeight}pt</span>
          </div>
          <div>
            <span className="text-muted-foreground">Font: </span>
            <span className="font-medium">{styling.fontFamily} {styling.fontSize}px</span>
          </div>
        </div>
        <div className="ml-auto text-xs text-muted-foreground italic">
          Tip: Drag column right-border to resize width • Drag bottom of last row to change row height
        </div>
      </div>
    </div>
  );
}
