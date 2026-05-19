import { useState } from "react";
import { FileSpreadsheet, ChevronDown, ChevronRight, Search, X, Upload, Hash, AlignLeft, Calendar, ToggleLeft, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkbookData, SheetMeta, ColumnMeta, InferredType, TYPE_COLORS, formatFileSize } from "@/lib/excel-engine";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DRAG_COL_KEY } from "./mapping-canvas";

export type { WorkbookData };

const TYPE_ICONS: Record<InferredType, React.ReactNode> = {
  text: <AlignLeft className="h-3 w-3" />,
  number: <Hash className="h-3 w-3" />,
  date: <Calendar className="h-3 w-3" />,
  boolean: <ToggleLeft className="h-3 w-3" />,
  mixed: <HelpCircle className="h-3 w-3" />,
  empty: <span className="h-3 w-3 inline-block" />,
};

interface WorkbookExplorerProps {
  workbook: WorkbookData | null;
  selectedSheetIdx: number;
  selectedColumnName: string | null;
  draggable?: boolean;
  onSelectSheet: (idx: number) => void;
  onSelectColumn: (colName: string, sheetIdx: number) => void;
  onUploadClick: () => void;
}

export function WorkbookExplorer({
  workbook,
  selectedSheetIdx,
  selectedColumnName,
  draggable = false,
  onSelectSheet,
  onSelectColumn,
  onUploadClick,
}: WorkbookExplorerProps) {
  const [expandedSheets, setExpandedSheets] = useState<Set<number>>(new Set([0]));
  const [search, setSearch] = useState("");

  const toggleSheet = (idx: number) => {
    setExpandedSheets(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const matchesSearch = (col: ColumnMeta) =>
    !search || col.name.toLowerCase().includes(search.toLowerCase());

  const filteredSheets = workbook?.sheets.map(sheet => ({
    ...sheet,
    columns: sheet.columns.filter(matchesSearch),
  })) ?? [];

  const totalMatchedCols = filteredSheets.reduce((s, sh) => s + sh.columns.length, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 border-b space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Workbook Explorer</span>
          <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1" onClick={onUploadClick}>
            <Upload className="h-3 w-3" />
            {workbook ? "Replace" : "Upload"}
          </Button>
        </div>

        {workbook && (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter columns…"
              className="h-7 pl-6 pr-6 text-xs"
            />
            {search && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
                <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
        )}

        {draggable && workbook && (
          <p className="text-[10px] text-muted-foreground leading-tight bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded px-2 py-1">
            Drag any column to a mapping slot →
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!workbook ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-4 text-center">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
              <FileSpreadsheet className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No workbook loaded</p>
              <p className="text-xs text-muted-foreground mt-1">Upload an Excel file to begin</p>
            </div>
            <Button size="sm" onClick={onUploadClick} className="gap-2">
              <Upload className="h-4 w-4" /> Upload Excel File
            </Button>
          </div>
        ) : (
          <div className="py-1">
            <WorkbookHeader workbook={workbook} />

            {search && (
              <div className="px-3 py-1.5">
                <p className="text-xs text-muted-foreground">
                  {totalMatchedCols} column{totalMatchedCols !== 1 ? "s" : ""} matching "{search}"
                </p>
              </div>
            )}

            {filteredSheets.map((sheet) => (
              <SheetNode
                key={sheet.index}
                sheet={sheet}
                isExpanded={expandedSheets.has(sheet.index) || !!search}
                isActiveSheet={selectedSheetIdx === sheet.index}
                selectedColumnName={selectedColumnName}
                draggable={draggable}
                workbook={workbook}
                onToggle={() => toggleSheet(sheet.index)}
                onSelectSheet={() => onSelectSheet(sheet.index)}
                onSelectColumn={(colName) => onSelectColumn(colName, sheet.index)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkbookHeader({ workbook }: { workbook: WorkbookData }) {
  return (
    <div className="px-3 py-2 mb-1">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-medium truncate" title={workbook.fileName}>
          {workbook.fileName}
        </span>
      </div>
      <div className="flex items-center gap-3 mt-1 ml-6 text-xs text-muted-foreground">
        <span>{workbook.sheets.length} sheet{workbook.sheets.length !== 1 ? "s" : ""}</span>
        <span>•</span>
        <span>{workbook.totalRows.toLocaleString()} rows</span>
        <span>•</span>
        <span>{formatFileSize(workbook.fileSize)}</span>
      </div>
    </div>
  );
}

interface SheetNodeProps {
  sheet: SheetMeta & { columns: ColumnMeta[] };
  isExpanded: boolean;
  isActiveSheet: boolean;
  selectedColumnName: string | null;
  draggable: boolean;
  workbook: WorkbookData;
  onToggle: () => void;
  onSelectSheet: () => void;
  onSelectColumn: (colName: string) => void;
}

function SheetNode({
  sheet, isExpanded, isActiveSheet, selectedColumnName, draggable,
  workbook, onToggle, onSelectSheet, onSelectColumn,
}: SheetNodeProps) {
  return (
    <div>
      <button
        className={cn(
          "w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/60 transition-colors group",
          isActiveSheet && "bg-muted"
        )}
        onClick={() => { onSelectSheet(); if (!isExpanded) onToggle(); }}
      >
        <span onClick={(e) => { e.stopPropagation(); onToggle(); }} className="flex-shrink-0">
          {isExpanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </span>
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: sheet.color }} />
        <span className={cn("text-sm truncate flex-1", isActiveSheet ? "font-semibold" : "font-medium")}>
          {sheet.name}
        </span>
        <span className="text-xs text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {sheet.rowCount.toLocaleString()}r
        </span>
      </button>

      {isExpanded && (
        <div>
          {sheet.columns.length === 0 ? (
            <div className="px-8 py-1.5 text-xs text-muted-foreground italic">No columns found</div>
          ) : (
            sheet.columns.map((col) => (
              <ColumnNode
                key={col.name}
                col={col}
                sheet={sheet}
                workbook={workbook}
                isSelected={selectedColumnName === col.name}
                isDraggable={draggable}
                onClick={() => onSelectColumn(col.name)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ColumnNode({ col, sheet, workbook, isSelected, isDraggable, onClick }: {
  col: ColumnMeta;
  sheet: SheetMeta;
  workbook: WorkbookData;
  isSelected: boolean;
  isDraggable: boolean;
  onClick: () => void;
}) {
  const tc = TYPE_COLORS[col.inferredType];

  const handleDragStart = (e: React.DragEvent) => {
    const data = {
      sheetName: col.sheetName,
      sheetIndex: col.sheetIndex,
      columnName: col.name,
      inferredType: col.inferredType,
    };
    e.dataTransfer.setData(DRAG_COL_KEY, JSON.stringify(data));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      draggable={isDraggable}
      onDragStart={isDraggable ? handleDragStart : undefined}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1 text-left hover:bg-muted/40 transition-colors group",
        isSelected && "bg-primary/10",
        isDraggable && "cursor-grab active:cursor-grabbing"
      )}
      onClick={onClick}
    >
      <span className="w-3.5 shrink-0" />
      <span className="w-3.5 shrink-0" />
      <span className={cn("shrink-0 p-0.5 rounded", tc.bg, tc.text)}>
        {TYPE_ICONS[col.inferredType]}
      </span>
      <span className={cn(
        "text-xs truncate flex-1",
        isSelected ? "text-primary font-medium" : "text-foreground/80"
      )}>
        {col.name}
      </span>
      {col.nullCount > 0 && (
        <span className="text-xs text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {Math.round((col.nullCount / col.totalCount) * 100)}% null
        </span>
      )}
    </div>
  );
}
