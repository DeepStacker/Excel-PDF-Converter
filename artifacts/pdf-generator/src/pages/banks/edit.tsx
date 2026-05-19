import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { VisualBankDesigner, TableConfig, StylingConfig, ColumnConfig } from "@/components/visual-bank-designer";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SaveConfig {
  name: string;
  code: string;
  description: string;
  columnMapping: TableConfig;
  pdfStyle: StylingConfig;
  auditTypes: { code: string; label: string }[];
  isActive: boolean;
}

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

function convertToTableConfig(columnMapping: any): TableConfig {
  if (!columnMapping) return { columns: [], groupByColumn: "", branchNameColumn: "", stateColumn: "" };
  const columns: ColumnConfig[] = (columnMapping.columns || []).map((col: any, idx: number) => ({
    id: `col-${idx}-${Date.now()}`,
    header: col.header || "",
    excelColumn: col.excelColumn || "",
    width: col.width || 100,
    dataType: col.dataType || "text",
    alignment: (col.alignment || "left") as "left" | "center" | "right",
    visible: col.visible !== false,
    isBlank: col.excelColumn === null || col.excelColumn === "",
    headerColor: col.headerColor || undefined,
  }));
  return {
    columns,
    groupByColumn: columnMapping.branchGroupBy || "",
    branchNameColumn: columnMapping.branchNameCol || "",
    stateColumn: columnMapping.stateCol || "",
  };
}

function convertToStylingConfig(pdfStyle: any): StylingConfig {
  if (!pdfStyle) return DEFAULT_STYLE;
  return {
    pageOrientation: pdfStyle.pageOrientation || "portrait",
    headerColors: pdfStyle.headerColors || [pdfStyle.headerColor1 || "#FFFF00", pdfStyle.headerColor2 || "#4985E8"],
    fontSize: pdfStyle.fontSize || 10,
    fontFamily: pdfStyle.fontFamily || "Arial",
    rowHeight: pdfStyle.rowHeight || 22,
    headerRowHeight: pdfStyle.headerRowHeight || 28,
    borderStyle: pdfStyle.borderStyle || "solid",
    borderWidth: pdfStyle.borderWidth || 0.5,
    alternateRowColor: pdfStyle.alternateRowColor ?? true,
    alternateRowColor2: pdfStyle.alternateRowColor2 || "#F2F2F2",
    includeSummary: pdfStyle.includeSummary ?? false,
    summaryTitle: pdfStyle.summaryTitle || "Total",
  };
}

export default function EditBankPage() {
  const [, params] = useRoute("/banks/:id/edit");
  const [, setLocation] = useLocation();
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: bank, isLoading, isError } = useQuery({
    queryKey: ["/api/banks", id],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/banks/${id}`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!id && id > 0,
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: object) => {
      const res = await fetch(`/api/banks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to update bank" }));
        const e = new Error(err.error || "Failed to update bank") as any;
        e.status = res.status;
        throw e;
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Bank configuration updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/banks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/banks", id] });
      setLocation("/banks");
    },
    onError: (err: any) => {
      toast({ title: "Failed to update bank", description: err?.message || "An error occurred", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !bank) {
    return <div className="text-destructive p-4">Failed to load bank configuration. <Button variant="link" onClick={() => setLocation("/banks")}>Go back</Button></div>;
  }

  const initialConfig: Partial<SaveConfig> = {
    name: bank.name,
    code: bank.code,
    description: bank.description || "",
    isActive: bank.isActive ?? true,
    columnMapping: convertToTableConfig(bank.columnMapping),
    pdfStyle: convertToStylingConfig(bank.pdfStyle),
    auditTypes: bank.auditTypes || [],
  };

  const handleSave = (config: SaveConfig) => {
    const payload = {
      name: config.name,
      code: config.code,
      description: config.description,
      isActive: config.isActive,
      auditTypes: config.auditTypes.filter(a => a.code.trim()),
      columnMapping: {
        branchGroupBy: config.columnMapping.groupByColumn,
        branchNameCol: config.columnMapping.branchNameColumn,
        stateCol: config.columnMapping.stateColumn,
        columns: config.columnMapping.columns.map(col => ({
          header: col.header,
          excelColumn: col.isBlank ? null : col.excelColumn,
          width: col.width,
          dataType: col.dataType === "date" || col.dataType === "currency" ? "text" : col.dataType,
          alignment: col.alignment,
          headerColor: col.headerColor ?? null,
        })),
      },
      pdfStyle: {
        pageOrientation: config.pdfStyle.pageOrientation,
        headerColor1: config.pdfStyle.headerColors[0] || "#FFFF00",
        headerColor2: config.pdfStyle.headerColors[1] || "#4985E8",
        headerColors: config.pdfStyle.headerColors,
        fontSize: config.pdfStyle.fontSize,
        fontFamily: config.pdfStyle.fontFamily,
        rowHeight: config.pdfStyle.rowHeight,
        headerRowHeight: config.pdfStyle.headerRowHeight,
        borderStyle: config.pdfStyle.borderStyle,
        borderWidth: config.pdfStyle.borderWidth,
        alternateRowColor: config.pdfStyle.alternateRowColor,
        alternateRowColor2: config.pdfStyle.alternateRowColor2,
        includeSummary: config.pdfStyle.includeSummary,
        summaryTitle: config.pdfStyle.summaryTitle,
      },
    };
    updateMutation.mutate(payload);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/banks")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Bank Configuration</h1>
          <p className="text-muted-foreground mt-1">Updating: {bank.name}</p>
        </div>
      </div>
      <VisualBankDesigner
        onSave={handleSave}
        isSaving={updateMutation.isPending}
        initialConfig={initialConfig}
      />
    </div>
  );
}
