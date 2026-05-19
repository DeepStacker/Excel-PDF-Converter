import { useState, useRef, useCallback } from "react";
import {
  GripVertical, Trash2, Plus, PlusSquare, Wand2, ChevronDown,
  ArrowRight, Info, AlignLeft, AlignCenter, AlignRight, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkbookData, InferredType, TYPE_COLORS } from "@/lib/excel-engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export const DRAG_COL_KEY = "application/excel-column";
export const DRAG_ROW_KEY = "application/table-row-idx";

export interface SourceColumn {
  sheetName: string;
  sheetIndex: number;
  columnName: string;
  inferredType: InferredType;
}

export interface MappedColumn {
  id: string;
  header: string;
  source: SourceColumn | null;
  width: number;
  dataType: "text" | "number" | "date" | "currency";
  alignment: "left" | "center" | "right";
  isBlank: boolean;
}

export interface ColumnMapping {
  branchGroupBy: SourceColumn | null;
  branchName: SourceColumn | null;
  state: SourceColumn | null;
  tableColumns: MappedColumn[];
}

export const EMPTY_MAPPING: ColumnMapping = {
  branchGroupBy: null,
  branchName: null,
  state: null,
  tableColumns: [],
};

function makeId() {
  return `col-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function inferDataType(type: InferredType): MappedColumn["dataType"] {
  if (type === "number") return "number";
  if (type === "date") return "date";
  return "text";
}

interface MappingCanvasProps {
  workbook: WorkbookData | null;
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
}

export function MappingCanvas({ workbook, mapping, onChange }: MappingCanvasProps) {
  const [dragOverDocField, setDragOverDocField] = useState<string | null>(null);
  const [dragRowIdx, setDragRowIdx] = useState<number | null>(null);
  const [dragOverRowIdx, setDragOverRowIdx] = useState<number | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  const update = useCallback((partial: Partial<ColumnMapping>) => {
    onChange({ ...mapping, ...partial });
  }, [mapping, onChange]);

  const parseDragColData = (e: React.DragEvent): SourceColumn | null => {
    try {
      const raw = e.dataTransfer.getData(DRAG_COL_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as SourceColumn;
    } catch {
      return null;
    }
  };

  const handleDocFieldDrop = (field: keyof Pick<ColumnMapping, "branchGroupBy" | "branchName" | "state">, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverDocField(null);
    const src = parseDragColData(e);
    if (src) update({ [field]: src });
  };

  const handleColSourceDrop = (colId: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverColId(null);
    const src = parseDragColData(e);
    if (!src) return;
    update({
      tableColumns: mapping.tableColumns.map(c =>
        c.id === colId
          ? { ...c, source: src, isBlank: false, dataType: inferDataType(src.inferredType), header: c.header || src.columnName }
          : c
      ),
    });
  };

  const handleRowDragStart = (idx: number, e: React.DragEvent) => {
    e.dataTransfer.setData(DRAG_ROW_KEY, String(idx));
    setDragRowIdx(idx);
  };

  const handleRowDrop = (targetIdx: number, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverRowIdx(null);
    if (dragRowIdx === null || dragRowIdx === targetIdx) return;
    const cols = [...mapping.tableColumns];
    const [moved] = cols.splice(dragRowIdx, 1);
    cols.splice(targetIdx, 0, moved);
    update({ tableColumns: cols });
    setDragRowIdx(null);
  };

  const updateCol = (id: string, patch: Partial<MappedColumn>) => {
    update({ tableColumns: mapping.tableColumns.map(c => c.id === id ? { ...c, ...patch } : c) });
  };
  const removeCol = (id: string) => update({ tableColumns: mapping.tableColumns.filter(c => c.id !== id) });

  const addCol = (blank = false) => {
    update({
      tableColumns: [...mapping.tableColumns, {
        id: makeId(),
        header: blank ? "Manual Column" : "New Column",
        source: null,
        width: 100,
        dataType: "text",
        alignment: "left",
        isBlank: blank,
      }],
    });
  };

  const handleAutoImport = () => {
    if (!workbook) return;
    const columns: MappedColumn[] = [];
    workbook.sheets.forEach(sheet => {
      sheet.columns.forEach(col => {
        if (columns.some(c => c.source?.columnName === col.name && c.source.sheetName === sheet.name)) return;
        columns.push({
          id: makeId(),
          header: col.name,
          source: { sheetName: sheet.name, sheetIndex: sheet.index, columnName: col.name, inferredType: col.inferredType },
          width: 100,
          dataType: inferDataType(col.inferredType),
          alignment: col.inferredType === "number" ? "right" : "left",
          isBlank: false,
        });
      });
    });
    update({ tableColumns: columns });
  };

  const totalMapped = mapping.tableColumns.filter(c => !c.isBlank && c.source).length;
  const totalBlank = mapping.tableColumns.filter(c => c.isBlank || !c.source).length;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-5 py-3 border-b bg-muted/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">Data Mapping</span>
          {mapping.tableColumns.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {totalMapped} from Excel · {totalBlank} blank
            </span>
          )}
        </div>
        {workbook && (
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={handleAutoImport}>
            <Wand2 className="h-3.5 w-3.5" />
            Auto-import columns
          </Button>
        )}
      </div>

      <div className="flex-1 px-5 py-5 space-y-6">
        <DocumentFieldsSection
          workbook={workbook}
          mapping={mapping}
          dragOverDocField={dragOverDocField}
          onDragOver={(field, e) => { e.preventDefault(); setDragOverDocField(field); }}
          onDragLeave={() => setDragOverDocField(null)}
          onDrop={handleDocFieldDrop}
          onChangeField={(field, src) => update({ [field]: src })}
        />

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Table Columns</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Define the columns that appear in the generated PDF table. Drag from the workbook to assign an Excel source.
              </p>
            </div>
          </div>

          {mapping.tableColumns.length === 0 ? (
            <EmptyTableState workbook={workbook} onAddCol={addCol} onAutoImport={handleAutoImport} />
          ) : (
            <>
              <div className="rounded-lg border overflow-hidden">
                <div className="grid items-center bg-muted/50 border-b text-xs font-semibold text-muted-foreground px-2 py-2"
                  style={{ gridTemplateColumns: "24px 28px 1fr 200px 88px 68px 68px 32px" }}>
                  <span />
                  <span>#</span>
                  <span>PDF Column Header</span>
                  <span>Source (Excel Column)</span>
                  <span>Type</span>
                  <span>Align</span>
                  <span>Width</span>
                  <span />
                </div>
                {mapping.tableColumns.map((col, idx) => (
                  <TableColumnRow
                    key={col.id}
                    col={col}
                    idx={idx}
                    workbook={workbook}
                    isDragSource={dragRowIdx === idx}
                    isDragOver={dragOverRowIdx === idx}
                    isColDragOver={dragOverColId === col.id}
                    onDragStart={(e) => handleRowDragStart(idx, e)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverRowIdx(idx); }}
                    onDragLeave={() => setDragOverRowIdx(null)}
                    onDrop={(e) => handleRowDrop(idx, e)}
                    onDragEnd={() => { setDragRowIdx(null); setDragOverRowIdx(null); }}
                    onColDragOver={(e) => { e.preventDefault(); setDragOverColId(col.id); }}
                    onColDragLeave={() => setDragOverColId(null)}
                    onColDrop={(e) => handleColSourceDrop(col.id, e)}
                    onUpdate={(patch) => updateCol(col.id, patch)}
                    onRemove={() => removeCol(col.id)}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => addCol(false)}>
                  <Plus className="h-3.5 w-3.5" /> Add Column
                </Button>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => addCol(true)}>
                  <PlusSquare className="h-3.5 w-3.5" /> Add Blank Column
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface DocFieldsSectionProps {
  workbook: WorkbookData | null;
  mapping: ColumnMapping;
  dragOverDocField: string | null;
  onDragOver: (field: string, e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (field: keyof Pick<ColumnMapping, "branchGroupBy" | "branchName" | "state">, e: React.DragEvent) => void;
  onChangeField: (field: keyof Pick<ColumnMapping, "branchGroupBy" | "branchName" | "state">, src: SourceColumn | null) => void;
}

function DocumentFieldsSection({ workbook, mapping, dragOverDocField, onDragOver, onDragLeave, onDrop, onChangeField }: DocFieldsSectionProps) {
  const fields: Array<{
    key: keyof Pick<ColumnMapping, "branchGroupBy" | "branchName" | "state">;
    label: string;
    desc: string;
    required?: boolean;
  }> = [
    { key: "branchGroupBy", label: "Branch Group By", desc: "Groups Excel rows into separate PDFs per branch", required: true },
    { key: "branchName", label: "Branch Name", desc: "Displayed in each PDF's header title" },
    { key: "state", label: "State / Region", desc: "Displayed in each PDF's header" },
  ];

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-sm">Document Fields</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Drag a column from the workbook panel or use the dropdown to assign these critical fields.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {fields.map(({ key, label, desc, required }) => {
          const current = mapping[key];
          const isDragOver = dragOverDocField === key;
          return (
            <div
              key={key}
              className={cn(
                "rounded-lg border-2 p-3 transition-all",
                isDragOver ? "border-primary bg-primary/5 scale-[1.01]" : current ? "border-green-500/40 bg-green-50/50 dark:bg-green-900/10" : "border-dashed border-muted-foreground/30 hover:border-muted-foreground/50"
              )}
              onDragOver={(e) => onDragOver(key, e)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(key, e)}
            >
              <div className="flex items-start justify-between gap-1 mb-2">
                <div>
                  <span className="text-xs font-semibold">{label}</span>
                  {required && <span className="ml-1 text-destructive text-xs">*</span>}
                  <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{desc}</p>
                </div>
                {current && (
                  <button onClick={() => onChangeField(key, null)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {current ? (
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{
                    backgroundColor: workbook?.sheets.find(s => s.name === current.sheetName)?.color ?? "#ccc"
                  }} />
                  <span className="text-xs font-mono font-medium truncate" title={current.columnName}>{current.columnName}</span>
                  <span className="text-xs text-muted-foreground shrink-0">({current.sheetName})</span>
                </div>
              ) : (
                <>
                  {workbook ? (
                    <ColumnSelector
                      value={null}
                      workbook={workbook}
                      onChange={(src) => onChangeField(key, src)}
                      placeholder="Select column or drag here…"
                    />
                  ) : (
                    <div className="text-xs text-muted-foreground italic mt-1">Upload a workbook first</div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface TableColumnRowProps {
  col: MappedColumn;
  idx: number;
  workbook: WorkbookData | null;
  isDragSource: boolean;
  isDragOver: boolean;
  isColDragOver: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onColDragOver: (e: React.DragEvent) => void;
  onColDragLeave: () => void;
  onColDrop: (e: React.DragEvent) => void;
  onUpdate: (patch: Partial<MappedColumn>) => void;
  onRemove: () => void;
}

function TableColumnRow({
  col, idx, workbook, isDragSource, isDragOver, isColDragOver,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
  onColDragOver, onColDragLeave, onColDrop,
  onUpdate, onRemove,
}: TableColumnRowProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        "grid items-center border-b last:border-b-0 px-2 py-1.5 text-xs transition-colors",
        isDragOver && "bg-primary/5 border-primary/30",
        isDragSource && "opacity-40",
      )}
      style={{ gridTemplateColumns: "24px 28px 1fr 200px 88px 68px 68px 32px" }}
    >
      <span className="text-muted-foreground cursor-grab active:cursor-grabbing flex items-center">
        <GripVertical className="h-3.5 w-3.5" />
      </span>

      <span className="text-muted-foreground font-mono">{idx + 1}</span>

      <div className="pr-2">
        <Input
          value={col.header}
          onChange={e => onUpdate({ header: e.target.value })}
          className="h-6 text-xs px-2 w-full"
          placeholder="Column label"
        />
      </div>

      <div
        className={cn(
          "pr-2 rounded transition-colors",
          isColDragOver && "ring-2 ring-primary ring-offset-1"
        )}
        onDragOver={onColDragOver}
        onDragLeave={onColDragLeave}
        onDrop={onColDrop}
      >
        {col.isBlank || !workbook ? (
          <div className="h-6 px-2 flex items-center gap-1 rounded border border-dashed border-muted-foreground/30 text-muted-foreground italic text-xs">
            <span>Blank / manual</span>
          </div>
        ) : col.source ? (
          <div className="h-6 px-2 flex items-center gap-1.5 rounded bg-muted border border-transparent hover:border-muted-foreground/30 cursor-pointer" onClick={() => onUpdate({ source: null })}>
            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: workbook.sheets.find(s => s.name === col.source!.sheetName)?.color ?? "#ccc" }} />
            <span className="truncate font-mono">{col.source.columnName}</span>
            <X className="h-2.5 w-2.5 ml-auto shrink-0 text-muted-foreground" />
          </div>
        ) : (
          <ColumnSelector
            value={col.source}
            workbook={workbook}
            onChange={(src) => onUpdate({ source: src, isBlank: false, header: col.header || src?.columnName || "" })}
            placeholder="Drop or select…"
          />
        )}
      </div>

      <Select value={col.dataType} onValueChange={(v: MappedColumn["dataType"]) => onUpdate({ dataType: v })}>
        <SelectTrigger className="h-6 text-xs mr-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="text" className="text-xs">Text</SelectItem>
          <SelectItem value="number" className="text-xs">Number</SelectItem>
          <SelectItem value="date" className="text-xs">Date</SelectItem>
          <SelectItem value="currency" className="text-xs">Currency</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center gap-0.5 mr-2">
        {(["left", "center", "right"] as const).map(align => (
          <button
            key={align}
            onClick={() => onUpdate({ alignment: align })}
            className={cn(
              "h-6 w-6 flex items-center justify-center rounded transition-colors",
              col.alignment === align ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
            )}
          >
            {align === "left" ? <AlignLeft className="h-3 w-3" /> : align === "center" ? <AlignCenter className="h-3 w-3" /> : <AlignRight className="h-3 w-3" />}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 mr-2">
        <Input
          type="number"
          value={col.width}
          onChange={e => onUpdate({ width: Math.max(30, Number(e.target.value)) })}
          className="h-6 text-xs px-1.5 w-full"
          min={30}
          max={400}
        />
      </div>

      <button onClick={onRemove} className="text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ColumnSelector({ value, workbook, onChange, placeholder }: {
  value: SourceColumn | null;
  workbook: WorkbookData;
  onChange: (src: SourceColumn | null) => void;
  placeholder?: string;
}) {
  const valueStr = value ? `${value.sheetName}|||${value.columnName}` : "";
  return (
    <Select
      value={valueStr}
      onValueChange={(v) => {
        if (!v || v === "__none__") { onChange(null); return; }
        const sepIdx = v.indexOf("|||");
        const sheetName = v.slice(0, sepIdx);
        const columnName = v.slice(sepIdx + 3);
        const sheet = workbook.sheets.find(s => s.name === sheetName);
        if (!sheet) return;
        const col = sheet.columns.find(c => c.name === columnName);
        if (!col) return;
        onChange({ sheetName, sheetIndex: sheet.index, columnName, inferredType: col.inferredType });
      }}
    >
      <SelectTrigger className="h-6 text-xs">
        <SelectValue placeholder={placeholder ?? "Select column…"} />
      </SelectTrigger>
      <SelectContent className="max-h-56">
        <SelectItem value="__none__" className="text-xs text-muted-foreground italic">
          — Not mapped —
        </SelectItem>
        {workbook.sheets.map(sheet => (
          <SelectGroup key={sheet.name}>
            <SelectLabel className="text-xs flex items-center gap-1.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: sheet.color }} />
              {sheet.name}
            </SelectLabel>
            {sheet.columns.map(col => (
              <SelectItem key={`${sheet.name}|||${col.name}`} value={`${sheet.name}|||${col.name}`} className="text-xs pl-5">
                <div className="flex items-center gap-1.5">
                  <span className={cn("px-1 rounded text-[8px] font-bold uppercase", TYPE_COLORS[col.inferredType].bg, TYPE_COLORS[col.inferredType].text)}>
                    {TYPE_COLORS[col.inferredType].label.slice(0, 3)}
                  </span>
                  {col.name}
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

function EmptyTableState({ workbook, onAddCol, onAutoImport }: { workbook: WorkbookData | null; onAddCol: (blank?: boolean) => void; onAutoImport: () => void; }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center">
      <p className="text-sm font-medium mb-1">No table columns defined</p>
      <p className="text-xs text-muted-foreground mb-5">
        {workbook
          ? "Auto-import all columns from your workbook, or add them one by one."
          : "Upload a workbook first, then define your table columns."}
      </p>
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {workbook && (
          <Button size="sm" className="gap-1.5" onClick={onAutoImport}>
            <Wand2 className="h-4 w-4" /> Auto-import All Columns
          </Button>
        )}
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onAddCol(false)}>
          <Plus className="h-4 w-4" /> Add Column
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onAddCol(true)}>
          <PlusSquare className="h-4 w-4" /> Add Blank Column
        </Button>
      </div>
    </div>
  );
}
