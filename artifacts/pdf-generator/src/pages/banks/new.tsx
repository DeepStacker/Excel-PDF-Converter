import { useLocation } from "wouter";
import { useCreateBank } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { VisualBankDesigner, TableConfig, StylingConfig } from "@/components/visual-bank-designer";
import { useToast } from "@/hooks/use-toast";
import { getListBanksQueryKey } from "@workspace/api-client-react";

export default function NewBankPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createMutation = useCreateBank({
    mutation: {
      onSuccess: () => {
        toast({ title: "Bank configuration created successfully" });
        queryClient.invalidateQueries({ queryKey: getListBanksQueryKey() });
        setLocation("/banks");
      },
      onError: (err: any) => {
        const msg = err?.response?.status === 409
          ? "A bank with this code already exists. Use a different code."
          : err.message;
        toast({ title: "Failed to create bank", description: msg, variant: "destructive" });
      }
    }
  });

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

    createMutation.mutate({
      data: {
        name: config.name,
        code: config.code,
        description: config.description,
        columnMapping,
        pdfStyle,
        auditTypes: config.auditTypes,
        isActive: true,
      }
    });
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">New Bank Configuration</h1>
        <p className="text-muted-foreground mt-1">Upload your Excel file and configure the PDF layout visually</p>
      </div>

      <VisualBankDesigner onSave={handleSave} />
    </div>
  );
}