import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { VisualBankDesigner, TableConfig, StylingConfig } from "@/components/visual-bank-designer";
import { useToast } from "@/hooks/use-toast";

interface SaveConfig {
  name: string;
  code: string;
  description: string;
  columnMapping: TableConfig;
  pdfStyle: StylingConfig;
  auditTypes: { code: string; label: string }[];
  isActive: boolean;
}

async function createBank(payload: object) {
  const res = await fetch("/api/banks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to create bank" }));
    const e = new Error(err.error || "Failed to create bank") as any;
    e.status = res.status;
    throw e;
  }
  return res.json();
}

export default function NewBankPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: createBank,
    onSuccess: () => {
      toast({ title: "Bank configuration created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/banks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setLocation("/banks");
    },
    onError: (err: any) => {
      const msg = err?.status === 409
        ? "A bank with this code already exists. Use a different code."
        : (err?.message || "An error occurred");
      toast({ title: "Failed to create bank", description: msg, variant: "destructive" });
    },
  });

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
    createMutation.mutate(payload);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Bank Configuration</h1>
        <p className="text-muted-foreground mt-1">
          Upload your Excel file and design the PDF layout step by step
        </p>
      </div>
      <VisualBankDesigner onSave={handleSave} isSaving={createMutation.isPending} />
    </div>
  );
}
