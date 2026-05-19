import { useState, useCallback, useMemo, useRef } from "react";
import { Upload, FileSpreadsheet, Check, Settings, Eye, Save, ChevronRight, ChevronLeft, Plus, Trash2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { VisualTableBuilder, ColumnConfig, StylingConfig } from "./visual-table-builder";

export type { ColumnConfig, StylingConfig };

export interface TableConfig {
  columns: ColumnConfig[];
  groupByColumn: string;
  branchNameColumn: string;
  stateColumn: string;
}

export interface SheetConfig {
  name: string;
  index: number;
  color: string;
  selected: boolean;
}

interface SheetData {
  name: string;
  headers: string[];
  rows: Record<string, string>[];
  index: number;
}

interface ExcelData {
  sheets: SheetData[];
}

interface SaveConfig {
  name: string;
  code: string;
  description: string;
  columnMapping: TableConfig;
  pdfStyle: StylingConfig;
  auditTypes: { code: string; label: string }[];
  isActive: boolean;
}

interface VisualBankDesignerProps {
  onSave: (config: SaveConfig) => void;
  isSaving?: boolean;
  initialConfig?: Partial<SaveConfig>;
}

const STEP_LABELS = ["Upload Excel", "Design Table", "Style & Preview", "Save"];
const SHEET_COLORS = ["#4985E8", "#FFFF00", "#4CAF50", "#FF5722", "#9C27B0", "#00BCD4", "#FF9800", "#E91E63"];

const DEFAULT_STYLE: StylingConfig = {
  pageOrientation: "portrait",
  headerColors: ["#FFFF00", "#4985E8"],
  fontSize: 10,
  fontFamily: "Arial",
  rowHeight: 22,
  headerRowHeight: 28,
  borderStyle: "solid",
  borderWidth: 0.5,
  alternateRowColor: true,
  alternateRowColor2: "#F2F2F2",
  includeSummary: false,
  summaryTitle: "Total",
};

export function VisualBankDesigner({ onSave, isSaving, initialConfig }: VisualBankDesignerProps) {
  const [step, setStep] = useState(initialConfig?.columnMapping?.columns?.length ? 1 : 0);
  const [excelData, setExcelData] = useState<ExcelData | null>(null);
  const [selectedSheets, setSelectedSheets] = useState<SheetConfig[]>([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [table, setTable] = useState<TableConfig>(
    initialConfig?.columnMapping ?? { columns: [], groupByColumn: "", branchNameColumn: "", stateColumn: "" }
  );
  const [style, setStyle] = useState<StylingConfig>(initialConfig?.pdfStyle ?? DEFAULT_STYLE);
  const [bankInfo, setBankInfo] = useState({
    name: initialConfig?.name ?? "",
    code: initialConfig?.code ?? "",
    description: initialConfig?.description ?? "",
    isActive: initialConfig?.isActive ?? true,
    auditTypes: initialConfig?.auditTypes ?? [{ code: "POA", label: "Physical Verification" }],
  });

  const allHeaders = useMemo(() => {
    const fromCols = table.columns.filter(c => c.excelColumn && !c.isBlank).map(c => c.excelColumn);
    const currentSelections = [table.groupByColumn, table.branchNameColumn, table.stateColumn].filter(Boolean);
    if (!excelData) return Array.from(new Set([...fromCols, ...currentSelections]));
    const headers = new Set<string>([...currentSelections]);
    excelData.sheets.forEach((s, i) => {
      if (selectedSheets[i]?.selected) s.headers.forEach(h => headers.add(h));
    });
    return Array.from(headers);
  }, [excelData, selectedSheets, table.columns, table.groupByColumn, table.branchNameColumn, table.stateColumn]);

  const sheetColors = useMemo(() =>
    selectedSheets.filter(s => s.selected).map(s => s.color),
    [selectedSheets]
  );

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheets: SheetData[] = workbook.SheetNames.map((name: string, idx: number) => {
        const sheet = workbook.Sheets[name];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
        const headers = jsonData.length > 0
          ? (jsonData[0] as unknown[]).map((h) => String(h || "").trim()).filter(Boolean)
          : [];
        const rows = jsonData.slice(1, 6).map((row: unknown[]) => {
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => { obj[h] = String((row as unknown[])[i] ?? ""); });
          return obj;
        });
        return { name, headers, rows, index: idx };
      });
      setExcelData({ sheets });
      const configs: SheetConfig[] = workbook.SheetNames.map((name: string, idx: number) => ({
        name, index: idx, color: SHEET_COLORS[idx % SHEET_COLORS.length], selected: true,
      }));
      setSelectedSheets(configs);
    } catch (err) {
      console.error("Failed to parse Excel:", err);
    }
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  const initColumnsFromSheets = useCallback(() => {
    if (!excelData) return;
    const selectedSheetData = excelData.sheets.filter((_, i) => selectedSheets[i]?.selected);
    if (selectedSheetData.length === 0) return;
    const usedHeaders = new Map<string, number>();
    const columns: ColumnConfig[] = [];
    selectedSheetData.forEach((sheet, sheetIdx) => {
      sheet.headers.forEach(header => {
        if (!usedHeaders.has(header)) {
          usedHeaders.set(header, sheetIdx);
          columns.push({
            id: `col-${Date.now()}-${columns.length}`,
            header,
            excelColumn: header,
            sheetIndex: sheetIdx,
            width: 100,
            dataType: "text",
            alignment: "left",
            visible: true,
            isBlank: false,
            headerColor: undefined,
          });
        }
      });
    });
    setTable(prev => ({
      ...prev,
      columns,
      groupByColumn: columns[0]?.excelColumn ?? "",
      branchNameColumn: columns[1]?.excelColumn ?? "",
      stateColumn: columns[2]?.excelColumn ?? "",
    }));
    setStep(1);
  }, [excelData, selectedSheets]);

  const updateColumn = useCallback((id: string, updates: Partial<ColumnConfig>) => {
    setTable(prev => ({
      ...prev,
      columns: prev.columns.map(c => c.id === id ? { ...c, ...updates } : c),
    }));
  }, []);

  const removeColumn = useCallback((id: string) => {
    setTable(prev => ({ ...prev, columns: prev.columns.filter(c => c.id !== id) }));
  }, []);

  const moveColumn = useCallback((from: number, to: number) => {
    setTable(prev => {
      const cols = [...prev.columns];
      const [moved] = cols.splice(from, 1);
      cols.splice(to, 0, moved);
      return { ...prev, columns: cols };
    });
  }, []);

  const addColumn = useCallback((blank = false) => {
    setTable(prev => ({
      ...prev,
      columns: [...prev.columns, {
        id: `col-${Date.now()}`,
        header: blank ? "Manual Column" : "New Column",
        excelColumn: blank ? "" : (allHeaders[0] ?? ""),
        width: 100,
        dataType: "text",
        alignment: "left",
        visible: true,
        isBlank: blank,
      }],
    }));
  }, [allHeaders]);

  const canProceed = [
    true,
    table.columns.length > 0 && !!table.groupByColumn,
    true,
    bankInfo.name.length >= 2 && bankInfo.code.length >= 2 && bankInfo.auditTypes.length > 0,
  ];

  const handleSave = () => {
    onSave({
      name: bankInfo.name,
      code: bankInfo.code.toUpperCase(),
      description: bankInfo.description,
      columnMapping: table,
      pdfStyle: style,
      auditTypes: bankInfo.auditTypes,
      isActive: bankInfo.isActive,
    });
  };

  return (
    <div className="space-y-6">
      <StepIndicator currentStep={step} labels={STEP_LABELS} />

      {step === 0 && (
        <StepUpload
          excelData={excelData}
          selectedSheets={selectedSheets}
          isDraggingFile={isDraggingFile}
          fileInputRef={fileInputRef}
          onFileInputChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileUpload(f);
          }}
          onFileDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
          onFileDragLeave={() => setIsDraggingFile(false)}
          onFileDrop={handleFileDrop}
          onToggleSheet={(idx) => setSelectedSheets(prev => prev.map((s, i) => i === idx ? { ...s, selected: !s.selected } : s))}
          onSheetColorChange={(idx, color) => setSelectedSheets(prev => prev.map((s, i) => i === idx ? { ...s, color } : s))}
          onSkip={() => setStep(1)}
          onContinue={initColumnsFromSheets}
        />
      )}

      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Design Your PDF Table</CardTitle>
              <CardDescription>
                Drag column borders to resize width. Drag the bottom of the last row to change row height.
                Click any column to edit its settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                {[
                  { label: "Branch Grouping Column", desc: "Splits Excel rows into separate branch PDFs", key: "groupByColumn" },
                  { label: "Branch Name Column", desc: "Shown in each PDF's header", key: "branchNameColumn" },
                  { label: "State Column", desc: "Shown in each PDF's header", key: "stateColumn" },
                ].map(({ label, desc, key }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs font-semibold">{label}</Label>
                    <Select
                      value={(table as any)[key] || ""}
                      onValueChange={(v) => setTable(prev => ({ ...prev, [key]: v }))}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select column..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        {table.columns.map(c => c.excelColumn && !allHeaders.includes(c.excelColumn)
                          ? <SelectItem key={c.id} value={c.excelColumn}>{c.excelColumn}</SelectItem>
                          : null
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>

              <VisualTableBuilder
                columns={table.columns}
                styling={style}
                sheetColors={sheetColors.length > 0 ? sheetColors : style.headerColors}
                allHeaders={allHeaders}
                onColumnUpdate={updateColumn}
                onColumnMove={moveColumn}
                onColumnRemove={removeColumn}
                onColumnAdd={addColumn}
                onStylingUpdate={(updates) => setStyle(prev => ({ ...prev, ...updates }))}
              />

              {table.columns.length === 0 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No columns yet. Add columns using the buttons above, or go back and upload an Excel file to auto-detect columns.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(0)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button onClick={() => setStep(2)} disabled={!canProceed[1]}>
              Next: Style <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StylePanel style={style} onUpdate={(u) => setStyle(prev => ({ ...prev, ...u }))} />
            <LivePreviewPanel table={table} style={style} sheetColors={sheetColors.length > 0 ? sheetColors : style.headerColors} />
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button onClick={() => setStep(3)}>
              Next: Save <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-lg">Bank Information</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label>Bank Name *</Label>
                  <Input
                    value={bankInfo.name}
                    onChange={(e) => setBankInfo(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Acme Bank"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Code * <span className="text-xs text-muted-foreground">(short unique ID, letters only)</span></Label>
                  <Input
                    value={bankInfo.code}
                    onChange={(e) => setBankInfo(prev => ({ ...prev, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") }))}
                    placeholder="e.g. ACME"
                    className="uppercase font-mono"
                    maxLength={10}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Description <span className="text-xs text-muted-foreground">(optional)</span></Label>
                  <Input
                    value={bankInfo.description}
                    onChange={(e) => setBankInfo(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief notes about this bank"
                  />
                </div>
                <div className="flex items-center justify-between py-2 border-t">
                  <div>
                    <Label className="text-sm font-medium">Active</Label>
                    <p className="text-xs text-muted-foreground">Inactive banks won't appear in Generate PDFs</p>
                  </div>
                  <Switch
                    checked={bankInfo.isActive}
                    onCheckedChange={(v) => setBankInfo(prev => ({ ...prev, isActive: v }))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Audit Types</CardTitle>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setBankInfo(prev => ({ ...prev, auditTypes: [...prev.auditTypes, { code: "", label: "" }] }))}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
                <CardDescription>Define what audit categories are available for this bank</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {bankInfo.auditTypes.map((at, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={at.code}
                        onChange={(e) => setBankInfo(prev => ({
                          ...prev,
                          auditTypes: prev.auditTypes.map((a, j) => j === i ? { ...a, code: e.target.value.toUpperCase() } : a)
                        }))}
                        placeholder="Code (e.g. POA)"
                        className="w-28 font-mono text-sm uppercase"
                        maxLength={10}
                      />
                      <Input
                        value={at.label}
                        onChange={(e) => setBankInfo(prev => ({
                          ...prev,
                          auditTypes: prev.auditTypes.map((a, j) => j === i ? { ...a, label: e.target.value } : a)
                        }))}
                        placeholder="Label (e.g. Physical Verification)"
                        className="flex-1 text-sm"
                      />
                      <Button
                        variant="ghost" size="icon"
                        className="text-destructive hover:bg-destructive/10 shrink-0"
                        disabled={bankInfo.auditTypes.length === 1}
                        onClick={() => setBankInfo(prev => ({ ...prev, auditTypes: prev.auditTypes.filter((_, j) => j !== i) }))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Configuration Summary</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {[
                  { label: "Columns", value: `${table.columns.filter(c => c.visible).length} visible / ${table.columns.length} total` },
                  { label: "Table Width", value: `${table.columns.filter(c => c.visible).reduce((s, c) => s + c.width, 0) + 30}pt` },
                  { label: "Page", value: `${style.pageOrientation} A4 • ${style.fontFamily} ${style.fontSize}px` },
                  { label: "Audit Types", value: `${bankInfo.auditTypes.filter(a => a.code).length} types` },
                ].map(({ label, value }) => (
                  <div key={label} className="p-3 bg-muted/30 rounded-lg">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="font-semibold mt-0.5">{value}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button
              size="lg"
              onClick={handleSave}
              disabled={!canProceed[3] || isSaving}
              className="min-w-40"
            >
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {isSaving ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepIndicator({ currentStep, labels }: { currentStep: number; labels: string[] }) {
  const icons = [Upload, Settings, Eye, Save];
  return (
    <div className="flex items-center">
      {labels.map((label, i) => {
        const Icon = icons[i];
        const done = i < currentStep;
        const active = i === currentStep;
        return (
          <div key={i} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1.5">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                done ? "bg-primary text-primary-foreground" :
                active ? "bg-primary/20 text-primary border-2 border-primary" :
                "bg-muted text-muted-foreground"
              }`}>
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span className={`text-xs font-medium whitespace-nowrap ${active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"}`}>
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 mb-5 ${i < currentStep ? "bg-primary" : "bg-muted"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface StepUploadProps {
  excelData: ExcelData | null;
  selectedSheets: SheetConfig[];
  isDraggingFile: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileDragOver: (e: React.DragEvent) => void;
  onFileDragLeave: () => void;
  onFileDrop: (e: React.DragEvent) => void;
  onToggleSheet: (idx: number) => void;
  onSheetColorChange: (idx: number, color: string) => void;
  onSkip: () => void;
  onContinue: () => void;
}

function StepUpload({ excelData, selectedSheets, isDraggingFile, fileInputRef, onFileInputChange, onFileDragOver, onFileDragLeave, onFileDrop, onToggleSheet, onSheetColorChange, onSkip, onContinue }: StepUploadProps) {
  const hasSelection = selectedSheets.some(s => s.selected);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Your Excel File</CardTitle>
          <CardDescription>
            Upload your bank's Excel file to automatically detect column headers and configure the PDF layout.
            You can also configure manually without uploading.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer ${
              isDraggingFile ? "border-primary bg-primary/5 scale-[1.01]" : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30"
            }`}
            onDragOver={onFileDragOver}
            onDragLeave={onFileDragLeave}
            onDrop={onFileDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={onFileInputChange}
              className="hidden"
            />
            <FileSpreadsheet className={`h-12 w-12 mx-auto mb-3 ${isDraggingFile ? "text-primary" : "text-muted-foreground"}`} />
            <p className="text-base font-semibold mb-1">
              {isDraggingFile ? "Drop your Excel file here" : "Click or drag your Excel file here"}
            </p>
            <p className="text-sm text-muted-foreground">Supports .xlsx and .xls files</p>
          </div>

          {excelData && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-700 dark:text-green-400">
                  Excel loaded — {excelData.sheets.length} sheet{excelData.sheets.length !== 1 ? "s" : ""} detected
                </span>
              </div>

              <div>
                <Label className="text-sm font-semibold mb-3 block">Select Sheets & Assign Colors</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedSheets.map((sheet, i) => {
                    const sheetData = excelData.sheets[i];
                    return (
                      <div
                        key={i}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                          sheet.selected ? "border-primary bg-primary/5" : "border-muted opacity-60"
                        }`}
                        onClick={() => onToggleSheet(i)}
                      >
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            sheet.selected ? "border-primary bg-primary" : "border-muted-foreground/50"
                          }`}>
                            {sheet.selected && <Check className="h-3 w-3 text-primary-foreground" />}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{sheet.name}</span>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {sheetData?.headers.length ?? 0} cols
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {sheetData?.headers.slice(0, 4).join(", ")}
                            {(sheetData?.headers.length ?? 0) > 4 ? " ..." : ""}
                          </p>
                        </div>
                        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">color:</span>
                            <input
                              type="color"
                              value={sheet.color}
                              onChange={(e) => onSheetColorChange(i, e.target.value)}
                              className="w-7 h-7 rounded border cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {hasSelection && (
                <div>
                  <Label className="text-sm font-semibold mb-2 block">Data Preview</Label>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {excelData.sheets.filter((_, i) => selectedSheets[i]?.selected).map((sheet, idx) => {
                      const sheetCfg = selectedSheets[sheet.index];
                      return (
                        <div key={idx} className="border rounded-lg overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-1.5 text-white text-sm font-medium" style={{ backgroundColor: sheetCfg?.color || "#4985E8" }}>
                            <span>{sheet.name}</span>
                            <span className="opacity-70 text-xs">({sheet.headers.length} columns)</span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="text-xs w-full">
                              <thead>
                                <tr className="bg-muted/50">
                                  {sheet.headers.slice(0, 8).map((h, hi) => (
                                    <th key={hi} className="px-2 py-1.5 text-left font-medium whitespace-nowrap border-r last:border-r-0">{h}</th>
                                  ))}
                                  {sheet.headers.length > 8 && <th className="px-2 py-1.5 text-muted-foreground">+{sheet.headers.length - 8} more</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {sheet.rows.slice(0, 3).map((row, ri) => (
                                  <tr key={ri} className="border-t hover:bg-muted/20">
                                    {sheet.headers.slice(0, 8).map((h, hi) => (
                                      <td key={hi} className="px-2 py-1 truncate max-w-[120px] border-r last:border-r-0">{row[h]}</td>
                                    ))}
                                    {sheet.headers.length > 8 && <td />}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
              Skip — configure manually
            </Button>
            <Button onClick={onContinue} disabled={!hasSelection && !!excelData}>
              {excelData && hasSelection ? "Use Selected Sheets" : "Start with Empty Table"}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface StylePanelProps {
  style: StylingConfig;
  onUpdate: (updates: Partial<StylingConfig>) => void;
}

function StylePanel({ style, onUpdate }: StylePanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">PDF Styling</CardTitle>
        <CardDescription>Customize how your PDF looks</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Page Orientation</Label>
          <div className="flex gap-2">
            {(["portrait", "landscape"] as const).map((o) => (
              <button
                key={o}
                onClick={() => onUpdate({ pageOrientation: o })}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors capitalize ${
                  style.pageOrientation === o ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                }`}
              >
                {o === "portrait" ? "⬜ Portrait (210×297mm)" : "⬛ Landscape (297×210mm)"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold">Header Colors</Label>
          <p className="text-xs text-muted-foreground">Column headers alternate between these colors (left-to-right)</p>
          <div className="flex items-center gap-3 flex-wrap">
            {style.headerColors.map((color, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => {
                    const colors = [...style.headerColors];
                    colors[i] = e.target.value;
                    onUpdate({ headerColors: colors });
                  }}
                  className="w-9 h-9 rounded-lg border cursor-pointer"
                />
                <div>
                  <div className="text-xs font-mono">{color}</div>
                  <button
                    className="text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => style.headerColors.length > 1 && onUpdate({ headerColors: style.headerColors.filter((_, j) => j !== i) })}
                  >
                    remove
                  </button>
                </div>
              </div>
            ))}
            <Button
              variant="outline" size="sm"
              onClick={() => onUpdate({ headerColors: [...style.headerColors, "#666666"] })}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Color
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Font Family</Label>
            <select
              value={style.fontFamily}
              onChange={(e) => onUpdate({ fontFamily: e.target.value })}
              className="w-full h-9 px-3 rounded-md border bg-background text-sm"
            >
              {["Arial", "Helvetica", "Times New Roman", "Courier New", "Verdana", "Georgia"].map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Font Size: {style.fontSize}px</Label>
            <Slider min={6} max={18} step={1} value={[style.fontSize]} onValueChange={([v]) => onUpdate({ fontSize: v })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Row Height: {style.rowHeight}pt</Label>
            <Slider min={14} max={80} step={1} value={[style.rowHeight]} onValueChange={([v]) => onUpdate({ rowHeight: v })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Header Height: {style.headerRowHeight}pt</Label>
            <Slider min={16} max={80} step={1} value={[style.headerRowHeight]} onValueChange={([v]) => onUpdate({ headerRowHeight: v })} />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold">Border Style</Label>
          <div className="flex gap-2">
            {(["solid", "dashed", "dotted", "none"] as const).map((b) => (
              <button
                key={b}
                onClick={() => onUpdate({ borderStyle: b })}
                className={`flex-1 py-1.5 rounded-md border text-sm capitalize transition-colors ${
                  style.borderStyle === b ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
          {style.borderStyle !== "none" && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Border Width: {style.borderWidth}px</Label>
              <Slider min={0.25} max={3} step={0.25} value={[style.borderWidth]} onValueChange={([v]) => onUpdate({ borderWidth: v })} />
            </div>
          )}
        </div>

        <div className="space-y-3 border-t pt-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Alternating Row Colors</Label>
              <p className="text-xs text-muted-foreground">Every other row gets a different background</p>
            </div>
            <Switch checked={style.alternateRowColor} onCheckedChange={(v) => onUpdate({ alternateRowColor: v })} />
          </div>
          {style.alternateRowColor && (
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={style.alternateRowColor2}
                onChange={(e) => onUpdate({ alternateRowColor2: e.target.value })}
                className="w-9 h-9 rounded-lg border cursor-pointer"
              />
              <Input
                value={style.alternateRowColor2}
                onChange={(e) => onUpdate({ alternateRowColor2: e.target.value })}
                className="w-28 font-mono text-sm"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <div>
            <Label className="text-sm font-medium">Summary Row</Label>
            <p className="text-xs text-muted-foreground">Show a totals row at the end of each branch</p>
          </div>
          <Switch checked={style.includeSummary} onCheckedChange={(v) => onUpdate({ includeSummary: v })} />
        </div>
        {style.includeSummary && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Summary Label</Label>
            <Input
              value={style.summaryTitle}
              onChange={(e) => onUpdate({ summaryTitle: e.target.value })}
              className="max-w-[200px] text-sm"
              placeholder="Total"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface LivePreviewPanelProps {
  table: TableConfig;
  style: StylingConfig;
  sheetColors: string[];
}

const PREVIEW_BRANCHES = [
  { branchCode: "MH-001", branchName: "Mumbai - Andheri", state: "Maharashtra" },
  { branchCode: "DL-001", branchName: "Delhi - CP", state: "Delhi" },
];
const PREVIEW_ROWS = [
  { col1: "P-001", col2: "CU-2345", col3: "45.5", col4: "45.2", col5: "18K Above", col6: "OK" },
  { col1: "P-002", col2: "CU-6789", col3: "38.0", col4: "38.0", col5: "18K Above", col6: "" },
  { col1: "P-003", col2: "CU-1122", col3: "52.3", col4: "52.1", col5: "Below 18K", col6: "" },
];

function LivePreviewPanel({ table, style, sheetColors }: LivePreviewPanelProps) {
  const [zoom, setZoom] = useState(0.65);
  const visibleCols = table.columns.filter(c => c.visible);
  const totalWidth = visibleCols.reduce((s, c) => s + c.width, 0) + 30;
  const pageWidth = style.pageOrientation === "landscape" ? 770 : 525;
  const pageHeightMm = style.pageOrientation === "landscape" ? 210 : 297;
  const pageWidthMm = style.pageOrientation === "landscape" ? 297 : 210;
  const border = style.borderStyle === "none" ? "none" : `${style.borderWidth}px ${style.borderStyle} #888`;

  const getColColor = (col: ColumnConfig, idx: number) => {
    if (col.headerColor) return col.headerColor;
    return sheetColors[idx % Math.max(sheetColors.length, 1)] || "#4985E8";
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Live Preview</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}>
              <span className="text-sm">−</span>
            </Button>
            <span className="text-sm text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(1.2, z + 0.1))}>
              <span className="text-sm">+</span>
            </Button>
          </div>
        </div>
        <CardDescription>
          Page: {pageWidthMm}×{pageHeightMm}mm • Table width: {totalWidth}pt / {pageWidth}pt available
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        <div className="bg-slate-300 dark:bg-slate-700 p-4 rounded-lg overflow-auto">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: `${100 / zoom}%` }}>
            <div className="bg-white shadow-xl" style={{
              width: `${pageWidthMm * 3.78}px`,
              minHeight: `${pageHeightMm * 3.78 * 0.4}px`,
              padding: "15mm 12mm",
            }}>
              {PREVIEW_BRANCHES.slice(0, 1).map((branch, bi) => (
                <div key={bi}>
                  <div className="mb-3 p-2 bg-gray-700 text-white rounded text-center" style={{ fontSize: `${style.fontSize + 2}px`, fontFamily: style.fontFamily }}>
                    <div className="font-bold">{branch.branchName}</div>
                    <div className="text-xs opacity-75 mt-0.5">State: {branch.state} | Branch: {branch.branchCode}</div>
                  </div>
                  <div className="overflow-hidden">
                    <table className="border-collapse" style={{ width: `${totalWidth}px`, tableLayout: "fixed", fontSize: `${style.fontSize}px`, fontFamily: style.fontFamily }}>
                      <colgroup>
                        <col style={{ width: 30 }} />
                        {visibleCols.map(col => <col key={col.id} style={{ width: col.width }} />)}
                      </colgroup>
                      <thead>
                        <tr>
                          <th style={{ backgroundColor: "#555", color: "white", border, height: style.headerRowHeight, textAlign: "center", padding: "2px 4px", fontWeight: "bold" }}>#</th>
                          {visibleCols.map((col, ci) => (
                            <th key={col.id} style={{
                              backgroundColor: getColColor(col, ci), color: "white", border,
                              height: style.headerRowHeight, textAlign: "center", padding: "2px 4px",
                              fontWeight: "bold", overflow: "hidden",
                            }}>
                              {col.header.replace(/\\n/g, " / ").replace(/\n/g, " / ")}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {PREVIEW_ROWS.map((row, ri) => {
                          const rowKeys = Object.keys(row);
                          const bg = style.alternateRowColor && ri % 2 === 1 ? style.alternateRowColor2 : "#fff";
                          return (
                            <tr key={ri} style={{ backgroundColor: bg }}>
                              <td style={{ border, height: style.rowHeight, textAlign: "center", padding: "2px 4px", color: "#999" }}>{ri + 1}</td>
                              {visibleCols.map((col, ci) => (
                                <td key={col.id} style={{ border, height: style.rowHeight, textAlign: col.alignment, padding: "2px 6px", color: "#333", overflow: "hidden" }}>
                                  {col.isBlank ? "" : (row as any)[rowKeys[ci]] || ""}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                        {style.includeSummary && (
                          <tr style={{ backgroundColor: "#f0f0f0", fontWeight: "bold" }}>
                            <td colSpan={Math.min(3, visibleCols.length + 1)} style={{ border, height: style.rowHeight, textAlign: "right", padding: "2px 6px" }}>
                              {style.summaryTitle}: {PREVIEW_ROWS.length}
                            </td>
                            {visibleCols.slice(2).map((col) => <td key={col.id} style={{ border, height: style.rowHeight }} />)}
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
