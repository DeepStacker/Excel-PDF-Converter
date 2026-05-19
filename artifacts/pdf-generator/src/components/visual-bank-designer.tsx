import { useState, useCallback, useMemo } from "react";
import { Upload, FileSpreadsheet, X, Check, Settings, Eye, Save, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VisualTableBuilder } from "./visual-table-builder";
import { PdfPreview } from "./pdf-preview";

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
}

export interface SheetConfig {
  name: string;
  index: number;
  color: string;
  selected: boolean;
}

export interface TableConfig {
  columns: ColumnConfig[];
  groupByColumn: string;
  branchNameColumn: string;
  stateColumn: string;
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

interface SheetData {
  name: string;
  headers: string[];
  rows: Record<string, string>[];
  index: number;
}

interface ExcelData {
  sheets: SheetData[];
}

interface VisualBankDesignerProps {
  onSave: (config: {
    name: string;
    code: string;
    description: string;
    columnMapping: TableConfig;
    pdfStyle: StylingConfig;
    auditTypes: { code: string; label: string }[];
  }) => void;
  initialConfig?: {
    name: string;
    code: string;
    description: string;
    columnMapping: TableConfig;
    pdfStyle: StylingConfig;
    auditTypes: { code: string; label: string }[];
  };
}

const STEPS = [
  { id: "upload", label: "Upload Excel", icon: Upload },
  { id: "configure", label: "Configure Columns", icon: Settings },
  { id: "style", label: "Style & Preview", icon: Eye },
  { id: "save", label: "Save Config", icon: Save },
];

const DEFAULT_COLORS = [
  "#FFFF00", "#4985E8", "#4CAF50", "#FF5722", "#9C27B0",
  "#00BCD4", "#FF9800", "#795548", "#607D8B", "#E91E63"
];

const DEFAULT_FONTS = [
  "Arial", "Helvetica", "Times New Roman", "Courier New",
  "Verdana", "Georgia", "Trebuchet MS", "Comic Sans MS"
];

export function VisualBankDesigner({ onSave, initialConfig }: VisualBankDesignerProps) {
  const [step, setStep] = useState(0);
  const [excelData, setExcelData] = useState<ExcelData | null>(null);
  const [selectedSheets, setSelectedSheets] = useState<SheetConfig[]>([]);

  const [config, setConfig] = useState({
    name: initialConfig?.name ?? "",
    code: initialConfig?.code ?? "",
    description: initialConfig?.description ?? "",
    table: initialConfig?.columnMapping ?? {
      columns: [],
      groupByColumn: "",
      branchNameColumn: "",
      stateColumn: "",
    },
    style: initialConfig?.pdfStyle ?? {
      pageOrientation: "portrait" as const,
      headerColors: ["#FFFF00", "#4985E8"],
      fontSize: 10,
      fontFamily: "Arial",
      rowHeight: 20,
      headerRowHeight: 25,
      borderStyle: "solid" as const,
      borderWidth: 0.5,
      alternateRowColor: true,
      alternateRowColor2: "#F2F2F2",
      includeSummary: true,
      summaryTitle: "Summary",
    },
    auditTypes: initialConfig?.auditTypes ?? [{ code: "POA", label: "Physical Verification" }],
  });

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });

      const sheets: SheetData[] = workbook.SheetNames.map((name: string, idx: number) => ({
        name,
        headers: [] as string[],
        rows: [] as Record<string, string>[],
        index: idx,
      }));

      workbook.SheetNames.forEach((sheetName: string, idx: number) => {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

        if (jsonData.length > 0) {
          sheets[idx].headers = (jsonData[0] || []).map((h: unknown) => String(h || "").trim());
          sheets[idx].rows = jsonData.slice(1, 11).map((row: unknown[]) => {
            const obj: Record<string, string> = {};
            sheets[idx].headers.forEach((h: string, i: number) => {
              obj[h] = String(row[i] ?? "");
            });
            return obj;
          });
        }
      });

      setExcelData({ sheets });

      const sheetConfigs: SheetConfig[] = workbook.SheetNames.map((name: string, idx: number) => ({
        name,
        index: idx,
        color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
        selected: workbook.SheetNames.length === 1,
      }));
      setSelectedSheets(sheetConfigs);
    } catch (err) {
      console.error("Failed to parse Excel:", err);
    }
  }, []);

  const toggleSheet = useCallback((index: number) => {
    setSelectedSheets(prev => prev.map((s, i) =>
      i === index ? { ...s, selected: !s.selected } : s
    ));
  }, []);

  const initializeColumns = useCallback(() => {
    const selectedSheetData = excelData?.sheets.filter((_, i) =>
      selectedSheets[i]?.selected
    ) ?? [];

    if (selectedSheetData.length === 0) return;

    const columns: ColumnConfig[] = [];
    const allHeaders = new Set<string>();

    selectedSheetData.forEach(sheet => {
      sheet.headers.forEach(h => allHeaders.add(h));
    });

    let colIndex = 0;
    allHeaders.forEach(header => {
      columns.push({
        id: `col-${colIndex++}`,
        header,
        excelColumn: header,
        width: 100,
        dataType: "text",
        alignment: "left",
        visible: true,
      });
    });

    setConfig(prev => ({
      ...prev,
      table: {
        ...prev.table,
        columns,
        groupByColumn: columns[0]?.excelColumn ?? "",
        branchNameColumn: columns[1]?.excelColumn ?? "",
        stateColumn: columns[2]?.excelColumn ?? "",
      },
    }));
  }, [excelData, selectedSheets]);

  const updateColumn = useCallback((id: string, updates: Partial<ColumnConfig>) => {
    setConfig(prev => ({
      ...prev,
      table: {
        ...prev.table,
        columns: prev.table.columns.map(c =>
          c.id === id ? { ...c, ...updates } : c
        ),
      },
    }));
  }, []);

  const removeColumn = useCallback((id: string) => {
    setConfig(prev => ({
      ...prev,
      table: {
        ...prev.table,
        columns: prev.table.columns.filter(c => c.id !== id),
      },
    }));
  }, []);

  const moveColumn = useCallback((from: number, to: number) => {
    setConfig(prev => {
      const cols = [...prev.table.columns];
      const [moved] = cols.splice(from, 1);
      cols.splice(to, 0, moved);
      return {
        ...prev,
        table: { ...prev.table, columns: cols },
      };
    });
  }, []);

  const addColumn = useCallback(() => {
    setConfig(prev => ({
      ...prev,
      table: {
        ...prev.table,
        columns: [
          ...prev.table.columns,
          {
            id: `col-${Date.now()}`,
            header: "New Column",
            excelColumn: "",
            width: 100,
            dataType: "text",
            alignment: "left",
            visible: true,
          },
        ],
      },
    }));
  }, []);

  const allHeaders = useMemo(() => {
    if (!excelData) return [];
    const headers = new Set<string>();
    excelData.sheets.forEach(sheet => {
      sheet.headers.forEach(h => headers.add(h));
    });
    return Array.from(headers);
  }, [excelData]);

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <StepUpload
            excelData={excelData}
            selectedSheets={selectedSheets}
            onFileUpload={handleFileUpload}
            onToggleSheet={toggleSheet}
            onInitialize={() => { initializeColumns(); setStep(1); }}
          />
        );
      case 1:
        return (
          <StepConfigure
            config={config}
            allHeaders={allHeaders}
            selectedSheets={selectedSheets}
            onUpdateColumn={updateColumn}
            onRemoveColumn={removeColumn}
            onMoveColumn={moveColumn}
            onAddColumn={addColumn}
            onUpdateTable={(updates) => setConfig(prev => ({ ...prev, table: { ...prev.table, ...updates } }))}
            onUpdateStyle={(updates) => setConfig(prev => ({ ...prev, style: { ...prev.style, ...updates } }))}
            onNext={() => setStep(2)}
            onBack={() => setStep(0)}
          />
        );
      case 2:
        return (
          <StepStyle
            config={config}
            selectedSheets={selectedSheets}
            onUpdateStyle={(updates) => setConfig(prev => ({ ...prev, style: { ...prev.style, ...updates } }))}
            onAddAuditType={() => setConfig(prev => ({ ...prev, auditTypes: [...prev.auditTypes, { code: "", label: "" }] }))}
            onRemoveAuditType={(i) => setConfig(prev => ({ ...prev, auditTypes: prev.auditTypes.filter((_, idx) => idx !== i) }))}
            onUpdateAuditType={(i, field, value) => setConfig(prev => ({
              ...prev,
              auditTypes: prev.auditTypes.map((a, idx) => idx === i ? { ...a, [field]: value } : a)
            }))}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        );
      case 3:
        return (
          <StepSave
            config={config}
            onUpdateConfig={(updates) => setConfig(prev => ({ ...prev, ...updates }))}
            onSave={() => onSave({
              name: config.name,
              code: config.code,
              description: config.description,
              columnMapping: config.table,
              pdfStyle: config.style,
              auditTypes: config.auditTypes,
            })}
            onBack={() => setStep(2)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <StepIndicator currentStep={step} />
      {renderStep()}
    </div>
  );
}

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center">
          <div className={`
            flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium
            ${i <= currentStep ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}
          `}>
            {i < currentStep ? <Check className="h-4 w-4" /> : i + 1}
          </div>
          <span className={`ml-2 text-sm ${i <= currentStep ? "text-foreground" : "text-muted-foreground"}`}>
            {s.label}
          </span>
          {i < STEPS.length - 1 && <div className={`w-12 h-0.5 mx-2 ${i < currentStep ? "bg-primary" : "bg-muted"}`} />}
        </div>
      ))}
    </div>
  );
}

interface StepUploadProps {
  excelData: ExcelData | null;
  selectedSheets: SheetConfig[];
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleSheet: (index: number) => void;
  onInitialize: () => void;
}

function StepUpload({ excelData, selectedSheets, onFileUpload, onToggleSheet, onInitialize }: StepUploadProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Excel File</CardTitle>
        <CardDescription>Upload your Excel file to configure the PDF layout</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="border-2 border-dashed rounded-lg p-8 text-center hover:bg-muted/50 transition-colors">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={onFileUpload}
            className="hidden"
            id="excel-upload"
          />
          <label htmlFor="excel-upload" className="cursor-pointer">
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Click to upload Excel file</p>
            <p className="text-sm text-muted-foreground mt-1">Supports .xlsx and .xls files</p>
          </label>
        </div>

        {excelData && (
          <>
            <div>
              <h3 className="text-sm font-medium mb-3">Select Sheets to Include</h3>
              <div className="flex flex-wrap gap-2">
                {selectedSheets.map((sheet, i) => (
                  <button
                    key={i}
                    onClick={() => onToggleSheet(i)}
                    className={`
                      flex items-center gap-2 px-4 py-2 rounded-full border transition-all
                      ${sheet.selected ? "border-primary bg-primary/10" : "border-muted"}
                    `}
                  >
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: sheet.color }} />
                    <span>{sheet.name}</span>
                    {sheet.selected && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
            </div>

            {selectedSheets.some(s => s.selected) && (
              <div>
                <h3 className="text-sm font-medium mb-3">Preview</h3>
                <div className="space-y-4 max-h-64 overflow-y-auto">
                  {excelData.sheets.filter((_, i) => selectedSheets[i]?.selected).map((sheet, idx) => (
                    <div key={idx} className="border rounded-lg overflow-hidden">
                      <div className="bg-muted px-4 py-2 flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedSheets[sheet.index]?.color }} />
                        <span className="font-medium">{sheet.name}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted/50">
                              {sheet.headers.slice(0, 8).map((h, hi) => (
                                <th key={hi} className="px-3 py-2 text-left font-medium">{h}</th>
                              ))}
                              {sheet.headers.length > 8 && <th className="px-3 py-2">...</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {sheet.rows.slice(0, 5).map((row, ri) => (
                              <tr key={ri} className="border-t">
                                {sheet.headers.slice(0, 8).map((h, hi) => (
                                  <td key={hi} className="px-3 py-2 truncate max-w-[150px]">{row[h]}</td>
                                ))}
                                {sheet.headers.length > 8 && <td className="px-3 py-2">...</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={onInitialize} disabled={!selectedSheets.some(s => s.selected)}>
                Continue to Configure
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface StepConfigureProps {
  config: { table: TableConfig; style: StylingConfig };
  allHeaders: string[];
  selectedSheets: SheetConfig[];
  onUpdateColumn: (id: string, updates: Partial<ColumnConfig>) => void;
  onRemoveColumn: (id: string) => void;
  onMoveColumn: (from: number, to: number) => void;
  onAddColumn: () => void;
  onUpdateTable: (updates: Partial<TableConfig>) => void;
  onUpdateStyle: (updates: Partial<StylingConfig>) => void;
  onNext: () => void;
  onBack: () => void;
}

function StepConfigure({ config, allHeaders, selectedSheets, onUpdateColumn, onRemoveColumn, onMoveColumn, onAddColumn, onUpdateTable, onUpdateStyle, onNext, onBack }: StepConfigureProps) {
  const [activeTab, setActiveTab] = useState<"table" | "visual">("table");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Column Mapping</CardTitle>
          <CardDescription>Configure which Excel columns appear in the PDF and how they're displayed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Branch Grouping Column</Label>
              <Select value={config.table.groupByColumn} onValueChange={(v) => onUpdateTable({ groupByColumn: v })}>
                <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                <SelectContent>
                  {allHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Branch Name Column</Label>
              <Select value={config.table.branchNameColumn} onValueChange={(v) => onUpdateTable({ branchNameColumn: v })}>
                <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                <SelectContent>
                  {allHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>State Column</Label>
              <Select value={config.table.stateColumn} onValueChange={(v) => onUpdateTable({ stateColumn: v })}>
                <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                <SelectContent>
                  {allHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "table" | "visual")}>
                <TabsList>
                  <TabsTrigger value="table">
                    <Settings className="h-4 w-4 mr-1" /> Table View
                  </TabsTrigger>
                  <TabsTrigger value="visual">
                    <Eye className="h-4 w-4 mr-1" /> Visual Builder
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {activeTab === "table" && (
                <Button variant="outline" size="sm" onClick={onAddColumn}>
                  + Add Column
                </Button>
              )}
            </div>

            {activeTab === "table" ? (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-muted">
                    <th className="p-2 text-left w-16">Order</th>
                    <th className="p-2 text-left">Header Text</th>
                    <th className="p-2 text-left">Excel Column</th>
                    <th className="p-2 text-left w-24">Width</th>
                    <th className="p-2 text-left w-28">Data Type</th>
                    <th className="p-2 text-left w-28">Align</th>
                    <th className="p-2 text-left w-16">Show</th>
                    <th className="p-2 text-left w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {config.table.columns.map((col, i) => (
                    <tr key={col.id} className="border-b hover:bg-muted/30">
                      <td className="p-2">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === 0} onClick={() => onMoveColumn(i, i - 1)}>
                            <ChevronLeft className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === config.table.columns.length - 1} onClick={() => onMoveColumn(i, i + 1)}>
                            <ChevronRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                      <td className="p-2">
                        <Input
                          value={col.header}
                          onChange={(e) => onUpdateColumn(col.id, { header: e.target.value })}
                          className="h-8"
                        />
                      </td>
                      <td className="p-2">
                        <Select value={col.excelColumn} onValueChange={(v) => onUpdateColumn(col.id, { excelColumn: v })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {allHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          value={col.width}
                          onChange={(e) => onUpdateColumn(col.id, { width: Number(e.target.value) })}
                          className="h-8"
                        />
                      </td>
                      <td className="p-2">
                        <Select value={col.dataType} onValueChange={(v) => onUpdateColumn(col.id, { dataType: v as DataType })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="currency">Currency</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Select value={col.alignment} onValueChange={(v) => onUpdateColumn(col.id, { alignment: v as "left" | "center" | "right" })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="left">Left</SelectItem>
                            <SelectItem value="center">Center</SelectItem>
                            <SelectItem value="right">Right</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Switch checked={col.visible} onCheckedChange={(v) => onUpdateColumn(col.id, { visible: v })} />
                      </td>
                      <td className="p-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onRemoveColumn(col.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  Total columns: {config.table.columns.length} • Total width: {config.table.columns.reduce((s, c) => s + c.width, 0)}px
                </div>
              </div>
            ) : (
              <VisualTableBuilder
                columns={config.table.columns}
                styling={config.style}
                sheetColors={selectedSheets.map(s => s.color)}
                onColumnUpdate={onUpdateColumn}
                onColumnMove={onMoveColumn}
                onColumnRemove={onRemoveColumn}
                onColumnAdd={onAddColumn}
                onStylingUpdate={onUpdateStyle}
                allHeaders={allHeaders}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext}>
          Continue to Styling <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface StepStyleProps {
  config: {
    table: TableConfig;
    style: StylingConfig;
    auditTypes: { code: string; label: string }[];
  };
  selectedSheets: SheetConfig[];
  onUpdateStyle: (updates: Partial<StylingConfig>) => void;
  onAddAuditType: () => void;
  onRemoveAuditType: (i: number) => void;
  onUpdateAuditType: (i: number, field: string, value: string) => void;
  onNext: () => void;
  onBack: () => void;
}

function StepStyle({ config, selectedSheets, onUpdateStyle, onAddAuditType, onRemoveAuditType, onUpdateAuditType, onNext, onBack }: StepStyleProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>PDF Styling</CardTitle>
            <CardDescription>Configure the appearance of the generated PDF</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label>Page Orientation</Label>
                  <Select value={config.style.pageOrientation} onValueChange={(v) => onUpdateStyle({ pageOrientation: v as "portrait" | "landscape" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="portrait">Portrait</SelectItem>
                      <SelectItem value="landscape">Landscape</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Font Family</Label>
                  <Select value={config.style.fontFamily} onValueChange={(v) => onUpdateStyle({ fontFamily: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEFAULT_FONTS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Font Size</Label>
                    <Input type="number" value={config.style.fontSize} onChange={(e) => onUpdateStyle({ fontSize: Number(e.target.value) })} min={6} max={24} />
                  </div>
                  <div>
                  <Label>Row Height</Label>
                  <Input type="number" value={config.style.rowHeight} onChange={(e) => onUpdateStyle({ rowHeight: Number(e.target.value) })} min={10} max={100} />
                </div>
              </div>
              <div>
                <Label>Header Row Height</Label>
                <Input type="number" value={config.style.headerRowHeight} onChange={(e) => onUpdateStyle({ headerRowHeight: Number(e.target.value) })} min={10} max={100} />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Header Colors (for alternating columns)</Label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {config.style.headerColors.map((color, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => {
                          const colors = [...config.style.headerColors];
                          colors[i] = e.target.value;
                          onUpdateStyle({ headerColors: colors });
                        }}
                        className="w-8 h-8 rounded border cursor-pointer"
                      />
                      <Input
                        value={color}
                        onChange={(e) => {
                          const colors = [...config.style.headerColors];
                          colors[i] = e.target.value;
                          onUpdateStyle({ headerColors: colors });
                        }}
                        className="w-24 h-8"
                      />
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => onUpdateStyle({ headerColors: [...config.style.headerColors, "#000000"] })}>
                    + Add
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Border Style</Label>
                  <Select value={config.style.borderStyle} onValueChange={(v) => onUpdateStyle({ borderStyle: v as "solid" | "dashed" | "dotted" | "none" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="solid">Solid</SelectItem>
                      <SelectItem value="dashed">Dashed</SelectItem>
                      <SelectItem value="dotted">Dotted</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Border Width</Label>
                  <Input type="number" value={config.style.borderWidth} onChange={(e) => onUpdateStyle({ borderWidth: Number(e.target.value) })} min={0} max={5} step={0.1} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Alternate Row Colors</Label>
                <Switch checked={config.style.alternateRowColor} onCheckedChange={(v) => onUpdateStyle({ alternateRowColor: v })} />
              </div>
              {config.style.alternateRowColor && (
                <div className="flex items-center gap-2">
                  <Label>Alt Color</Label>
                  <input
                    type="color"
                    value={config.style.alternateRowColor2}
                    onChange={(e) => onUpdateStyle({ alternateRowColor2: e.target.value })}
                    className="w-8 h-8 rounded border cursor-pointer"
                  />
                  <Input
                    value={config.style.alternateRowColor2}
                    onChange={(e) => onUpdateStyle({ alternateRowColor2: e.target.value })}
                    className="w-24 h-8"
                  />
                </div>
              )}
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label>Include Summary Section</Label>
              <p className="text-sm text-muted-foreground">Add a summary at the end of each branch</p>
            </div>
            <Switch checked={config.style.includeSummary} onCheckedChange={(v) => onUpdateStyle({ includeSummary: v })} />
          </div>
          {config.style.includeSummary && (
            <div>
              <Label>Summary Title</Label>
              <Input
                value={config.style.summaryTitle}
                onChange={(e) => onUpdateStyle({ summaryTitle: e.target.value })}
                className="max-w-xs"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit Types</CardTitle>
          <CardDescription>Define the audit categories for this bank</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {config.auditTypes.map((type, i) => (
              <div key={i} className="flex gap-3">
                <Input
                  placeholder="Code"
                  value={type.code}
                  onChange={(e) => onUpdateAuditType(i, "code", e.target.value)}
                  className="w-32"
                />
                <Input
                  placeholder="Label"
                  value={type.label}
                  onChange={(e) => onUpdateAuditType(i, "label", e.target.value)}
                  className="flex-1"
                />
                <Button variant="ghost" size="icon" onClick={() => onRemoveAuditType(i)} disabled={config.auditTypes.length === 1}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={onAddAuditType}>
              + Add Audit Type
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <PdfPreview
          table={config.table}
          styling={config.style}
          sheetColors={selectedSheets.map(s => s.color)}
        />
      </div>

      <div className="col-span-full flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext}>
          Continue to Save <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface StepSaveProps {
  config: {
    name: string;
    code: string;
    description: string;
    style: StylingConfig;
    auditTypes: { code: string; label: string }[];
  };
  onUpdateConfig: (updates: { name?: string; code?: string; description?: string }) => void;
  onSave: () => void;
  onBack: () => void;
}

function StepSave({ config, onUpdateConfig, onSave, onBack }: StepSaveProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Save Configuration</CardTitle>
          <CardDescription>Give your configuration a name and save it</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Bank Name *</Label>
            <Input
              value={config.name}
              onChange={(e) => onUpdateConfig({ name: e.target.value })}
              placeholder="e.g. HDFC Bank Gold Assay"
              className="max-w-md"
            />
          </div>
          <div>
            <Label>Code * (unique identifier)</Label>
            <Input
              value={config.code}
              onChange={(e) => onUpdateConfig({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
              placeholder="e.g. HDFC_GOLD"
              className="max-w-xs uppercase"
              maxLength={10}
            />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Input
              value={config.description}
              onChange={(e) => onUpdateConfig({ description: e.target.value })}
              placeholder="Brief description of this configuration"
              className="max-w-md"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuration Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Audit Types:</span>
              <span className="ml-2 font-medium">{config.auditTypes.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Page:</span>
              <span className="ml-2 font-medium capitalize">{config.style.pageOrientation}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Font:</span>
              <span className="ml-2 font-medium">{config.style.fontFamily} {config.style.fontSize}px</span>
            </div>
            <div>
              <span className="text-muted-foreground">Borders:</span>
              <span className="ml-2 font-medium">{config.style.borderStyle} ({config.style.borderWidth}px)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onSave} disabled={!config.name || !config.code}>
          <Save className="mr-2 h-4 w-4" /> Save Configuration
        </Button>
      </div>
    </div>
  );
}