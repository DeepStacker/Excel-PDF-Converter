import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetBank, useUpdateBank, getListBanksQueryKey, getGetBankQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { VisualBankDesigner, TableConfig, StylingConfig, ColumnConfig, SheetConfig } from "@/components/visual-bank-designer";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function EditBankPage() {
  const [match, params] = useRoute("/banks/:id/edit");
  const [, setLocation] = useLocation();
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: bank, isLoading, isError } = useGetBank(id, {
    query: { queryKey: getGetBankQueryKey(id), enabled: !!id }
  });

  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelData, setExcelData] = useState<{ sheets: { name: string; headers: string[]; rows: Record<string, string>[]; index: number }[] } | null>(null);
  const [selectedSheets, setSelectedSheets] = useState<SheetConfig[]>([]);
  const [showReupload, setShowReupload] = useState(false);

  useEffect(() => {
    if (bank) {
      setSelectedSheets([{ name: "Current Config", index: 0, color: "#4985E8", selected: true }]);
    }
  }, [bank]);

  const updateMutation = useUpdateBank({
    mutation: {
      onSuccess: () => {
        toast({ title: "Bank configuration updated successfully" });
        queryClient.invalidateQueries({ queryKey: getListBanksQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBankQueryKey(id) });
        setLocation("/banks");
      },
      onError: (err: any) => {
        toast({ title: "Failed to update bank", description: err.message, variant: "destructive" });
      }
    }
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });

      const sheets = workbook.SheetNames.map((name: string, idx: number) => ({
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

      setExcelFile(file);
      setExcelData({ sheets });

      const colors = ["#FFFF00", "#4985E8", "#4CAF50", "#FF5722", "#9C27B0", "#00BCD4"];
      const sheetConfigs: SheetConfig[] = workbook.SheetNames.map((name: string, idx: number) => ({
        name,
        index: idx,
        color: colors[idx % colors.length],
        selected: true,
      }));
      setSelectedSheets(sheetConfigs);
    } catch (err) {
      toast({ title: "Failed to parse Excel file", variant: "destructive" });
    }
  };

  if (isLoading) {
    return <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded"></div>
      <div className="h-96 bg-muted rounded-xl"></div>
    </div>;
  }

  if (isError || !bank) {
    return <div className="text-destructive">Failed to load bank configuration.</div>;
  }

  const initialConfig = {
    name: bank.name,
    code: bank.code,
    description: bank.description || "",
    columnMapping: convertToTableConfig(bank.columnMapping),
    pdfStyle: convertToStylingConfig(bank.pdfStyle),
    auditTypes: bank.auditTypes || [],
  };

  const handleSave = (config: {
    name: string;
    code: string;
    description: string;
    columnMapping: TableConfig;
    pdfStyle: StylingConfig;
    auditTypes: { code: string; label: string }[];
  }) => {
    const columnMapping = {
      branchGroupBy: config.columnMapping.groupByColumn,
      branchNameCol: config.columnMapping.branchNameColumn,
      stateCol: config.columnMapping.stateColumn,
      columns: config.columnMapping.columns.map(col => ({
        header: col.header,
        excelColumn: col.excelColumn,
        width: col.width,
        dataType: col.dataType === "date" || col.dataType === "currency" ? "text" : col.dataType,
      })),
    };

    const pdfStyle = {
      pageOrientation: config.pdfStyle.pageOrientation,
      headerColor1: config.pdfStyle.headerColors[0] || "#FFFF00",
      headerColor2: config.pdfStyle.headerColors[1] || "#4985E8",
      fontSize: config.pdfStyle.fontSize,
      fontFamily: config.pdfStyle.fontFamily,
      rowHeight: config.pdfStyle.rowHeight,
      headerRowHeight: config.pdfStyle.headerRowHeight,
      borderStyle: config.pdfStyle.borderStyle,
      borderWidth: config.pdfStyle.borderWidth,
      alternateRowColor: config.pdfStyle.alternateRowColor,
      alternateRowColor2: config.pdfStyle.alternateRowColor2,
    };

    updateMutation.mutate({
      id,
      data: {
        name: config.name,
        code: config.code,
        description: config.description,
        columnMapping,
        pdfStyle,
        auditTypes: config.auditTypes,
        isActive: bank.isActive,
      }
    });
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/banks")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Edit Bank Configuration</h1>
          <p className="text-muted-foreground mt-1">Update the {bank.name} configuration</p>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowReupload(!showReupload)}
        >
          <Upload className="h-4 w-4 mr-2" />
          Re-upload Excel
        </Button>
      </div>

      {showReupload && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Re-upload Excel File</CardTitle>
            <CardDescription>Upload a new Excel file to update column mappings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed rounded-lg p-8 text-center hover:bg-muted/50 transition-colors">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                id="excel-upload-edit"
              />
              <label htmlFor="excel-upload-edit" className="cursor-pointer">
                <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">Click to upload new Excel file</p>
                <p className="text-sm text-muted-foreground mt-1">This will update the column mapping options</p>
              </label>
            </div>

            {excelData && (
              <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm text-green-800 font-medium">Excel file loaded successfully!</p>
                <p className="text-xs text-green-600 mt-1">{excelData.sheets.length} sheets detected. Column mappings will be updated on save.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <VisualBankDesigner
        onSave={handleSave}
        initialConfig={excelData ? undefined : initialConfig}
      />

      {excelData && (
        <div className="mt-6">
          <VisualBankDesigner
            onSave={handleSave}
            initialConfig={initialConfig}
          />
        </div>
      )}
    </div>
  );
}

function convertToTableConfig(columnMapping: any): TableConfig {
  if (!columnMapping) {
    return { columns: [], groupByColumn: "", branchNameColumn: "", stateColumn: "" };
  }

  const columns: ColumnConfig[] = (columnMapping.columns || []).map((col: any, idx: number) => ({
    id: `col-${idx}`,
    header: col.header || "",
    excelColumn: col.excelColumn || "",
    width: col.width || 100,
    dataType: col.dataType || "text",
    alignment: "left" as const,
    visible: true,
    headerColor: col.headerColor,
  }));

  return {
    columns,
    groupByColumn: columnMapping.branchGroupBy || "",
    branchNameColumn: columnMapping.branchNameCol || "",
    stateColumn: columnMapping.stateCol || "",
  };
}

function convertToStylingConfig(pdfStyle: any): StylingConfig {
  const defaultStyle: StylingConfig = {
    pageOrientation: "portrait",
    headerColors: ["#FFFF00", "#4985E8"],
    fontSize: 10,
    fontFamily: "Arial",
    rowHeight: 20,
    headerRowHeight: 25,
    borderStyle: "solid",
    borderWidth: 0.5,
    alternateRowColor: true,
    alternateRowColor2: "#F2F2F2",
    includeSummary: true,
    summaryTitle: "Summary",
  };

  if (!pdfStyle) return defaultStyle;

  return {
    pageOrientation: pdfStyle.pageOrientation || "portrait",
    headerColors: [
      pdfStyle.headerColor1 || "#FFFF00",
      pdfStyle.headerColor2 || "#4985E8",
    ],
    fontSize: pdfStyle.fontSize || 10,
    fontFamily: pdfStyle.fontFamily || "Arial",
    rowHeight: pdfStyle.rowHeight || 20,
    headerRowHeight: pdfStyle.headerRowHeight || 25,
    borderStyle: pdfStyle.borderStyle || "solid",
    borderWidth: pdfStyle.borderWidth || 0.5,
    alternateRowColor: pdfStyle.alternateRowColor ?? true,
    alternateRowColor2: pdfStyle.alternateRowColor2 || "#F2F2F2",
    includeSummary: pdfStyle.includeSummary ?? true,
    summaryTitle: pdfStyle.summaryTitle || "Summary",
  };
}