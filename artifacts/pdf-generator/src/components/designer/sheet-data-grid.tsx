import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkbookData, SheetMeta, TYPE_COLORS } from "@/lib/excel-engine";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PAGE_SIZES = [25, 50, 100];

interface SheetDataGridProps {
  workbook: WorkbookData | null;
  selectedSheetIdx: number;
  selectedColumnName: string | null;
  onSelectColumn: (colName: string, sheetIdx: number) => void;
}

export function SheetDataGrid({
  workbook,
  selectedSheetIdx,
  selectedColumnName,
  onSelectColumn,
}: SheetDataGridProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const tableRef = useRef<HTMLDivElement>(null);

  const sheet: SheetMeta | undefined = workbook?.sheets[selectedSheetIdx];
  const rows = sheet ? (workbook?.sheetRows[sheet.name] ?? []) : [];
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [selectedSheetIdx, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const startIdx = (page - 1) * pageSize;
  const pageRows = rows.slice(startIdx, startIdx + pageSize);

  const handleColumnClick = (colName: string) => {
    if (sheet) onSelectColumn(colName, sheet.index);
  };

  if (!workbook) {
    return (
      <EmptyState
        icon={<Table2 className="h-10 w-10 text-muted-foreground" />}
        title="No workbook loaded"
        description="Upload an Excel file using the panel on the left to preview its data here."
      />
    );
  }

  if (!sheet) {
    return (
      <EmptyState
        icon={<Table2 className="h-10 w-10 text-muted-foreground" />}
        title="Select a sheet"
        description="Click a sheet in the Workbook Explorer to preview its data."
      />
    );
  }

  if (sheet.rowCount === 0) {
    return (
      <EmptyState
        icon={<Table2 className="h-10 w-10 text-muted-foreground" />}
        title={`"${sheet.name}" is empty`}
        description="This sheet has no data rows. Try selecting a different sheet."
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/20 shrink-0">
        <div className="flex items-center gap-3">
          <span
            className="h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: sheet.color }}
          />
          <span className="font-semibold text-sm">{sheet.name}</span>
          <span className="text-xs text-muted-foreground">
            {sheet.rowCount.toLocaleString()} rows × {sheet.columnCount} columns
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {selectedColumnName && (
            <span className="px-2 py-0.5 bg-primary/10 text-primary rounded font-medium">
              {selectedColumnName} selected
            </span>
          )}
        </div>
      </div>

      <div ref={tableRef} className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: "max-content" }}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-12 px-2 py-2 bg-muted/80 border border-border text-center font-mono text-muted-foreground font-normal sticky left-0 z-20">
                #
              </th>
              {sheet.columns.map((col) => {
                const isSelected = selectedColumnName === col.name;
                const tc = TYPE_COLORS[col.inferredType];
                return (
                  <th
                    key={col.name}
                    className={cn(
                      "px-3 py-2 border border-border text-left cursor-pointer select-none whitespace-nowrap",
                      "transition-colors hover:bg-primary/5",
                      isSelected
                        ? "bg-primary/15 text-primary border-b-2 border-b-primary"
                        : "bg-muted/80 text-foreground"
                    )}
                    onClick={() => handleColumnClick(col.name)}
                    title={`Click to inspect "${col.name}" (${tc.label})`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={cn("px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide", tc.bg, tc.text)}>
                        {tc.label.slice(0, 3)}
                      </span>
                      <span className="font-medium">{col.name}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, rowIdx) => {
              const absRowIdx = startIdx + rowIdx;
              return (
                <tr
                  key={absRowIdx}
                  className={cn(
                    "hover:bg-muted/30 transition-colors",
                    rowIdx % 2 === 1 ? "bg-muted/10" : "bg-background"
                  )}
                >
                  <td className="px-2 py-1.5 border border-border/50 text-center font-mono text-muted-foreground text-[10px] sticky left-0 bg-muted/30">
                    {absRowIdx + 1}
                  </td>
                  {sheet.columns.map((col) => {
                    const isSelected = selectedColumnName === col.name;
                    const val = row[col.name];
                    const isEmpty = val === null || val === "" || val === undefined;
                    return (
                      <td
                        key={col.name}
                        className={cn(
                          "px-3 py-1.5 border border-border/50 max-w-[220px] cursor-pointer",
                          isSelected && "bg-primary/5",
                        )}
                        onClick={() => handleColumnClick(col.name)}
                        title={isEmpty ? "(empty)" : String(val)}
                      >
                        {isEmpty ? (
                          <span className="text-muted-foreground/40 italic text-[10px]">—</span>
                        ) : (
                          <span className="truncate block">{String(val)}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/10 shrink-0">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            Rows {startIdx + 1}–{Math.min(startIdx + pageSize, rows.length)} of {rows.length.toLocaleString()}
          </span>
          <div className="flex items-center gap-1.5">
            <span>Show</span>
            <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
              <SelectTrigger className="h-6 w-16 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map(s => (
                  <SelectItem key={s} value={String(s)} className="text-xs">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>rows</span>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-6 w-6" disabled={page === 1} onClick={() => setPage(1)}>
              <ChevronsLeft className="h-3 w-3" />
            </Button>
            <Button variant="outline" size="icon" className="h-6 w-6" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="text-xs px-2 text-muted-foreground">
              Page {page} / {totalPages}
            </span>
            <Button variant="outline" size="icon" className="h-6 w-6" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-3 w-3" />
            </Button>
            <Button variant="outline" size="icon" className="h-6 w-6" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>
              <ChevronsRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>
      </div>
    </div>
  );
}
