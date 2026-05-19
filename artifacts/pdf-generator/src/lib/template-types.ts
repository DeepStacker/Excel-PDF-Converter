import type { InferredType } from "./excel-engine";

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

export interface PdfStyle {
  pageSize: "A4" | "Letter" | "Legal" | "A3";
  pageOrientation: "portrait" | "landscape";
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  headerColor1: string;
  headerColor2: string;
  alternateRowColor: string;
  fontSize: number;
  headerFontSize: number;
  rowHeight: number;
  headerRowHeight: number;
  fontFamily: "Arial" | "Helvetica" | "Times New Roman";
  reportTitle: string;
  showDate: boolean;
  showAuditType: boolean;
  showPageNumbers: boolean;
  footerText: string;
}

export const DEFAULT_PDF_STYLE: PdfStyle = {
  pageSize: "A4",
  pageOrientation: "landscape",
  marginTop: 15,
  marginRight: 50,
  marginBottom: 15,
  marginLeft: 50,
  headerColor1: "#FFCC00",
  headerColor2: "#4985E8",
  alternateRowColor: "#F2F2F2",
  fontSize: 9,
  headerFontSize: 9,
  rowHeight: 30,
  headerRowHeight: 22,
  fontFamily: "Arial",
  reportTitle: "Branch Audit Report",
  showDate: true,
  showAuditType: true,
  showPageNumbers: true,
  footerText: "",
};

export interface SortRule {
  id: string;
  column: string;
  direction: "asc" | "desc";
}

export interface FilterRule {
  id: string;
  column: string;
  operator: "eq" | "neq" | "contains" | "not_contains" | "starts_with" | "gt" | "lt" | "gte" | "lte" | "is_empty" | "is_not_empty";
  value: string;
}

export interface RuleConfig {
  dataSheetIndex: number | null;
  sortRules: SortRule[];
  filters: FilterRule[];
  showSrNo: boolean;
  showTotalsRow: boolean;
  totalsColumns: string[];
  pageBreakBetweenBranches: boolean;
  skipEmptyBranches: boolean;
}

export const DEFAULT_RULES: RuleConfig = {
  dataSheetIndex: null,
  sortRules: [],
  filters: [],
  showSrNo: true,
  showTotalsRow: false,
  totalsColumns: [],
  pageBreakBetweenBranches: false,
  skipEmptyBranches: true,
};

export interface FullTemplateConfig {
  name: string;
  description: string;
  columnMapping: ColumnMapping;
  pdfStyle: PdfStyle;
  rules: RuleConfig;
}

export const DEFAULT_TEMPLATE: FullTemplateConfig = {
  name: "Untitled Template",
  description: "",
  columnMapping: EMPTY_MAPPING,
  pdfStyle: DEFAULT_PDF_STYLE,
  rules: DEFAULT_RULES,
};

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 200, g: 200, b: 200 };
}
