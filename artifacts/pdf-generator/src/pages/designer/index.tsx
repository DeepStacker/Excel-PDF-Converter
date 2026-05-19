import { useState, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FileUp, List, Landmark, Menu,
  Upload, Loader2, FileSpreadsheet, FlaskConical,
  Database, Link2, Palette, SlidersHorizontal, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseWorkbook, WorkbookData } from "@/lib/excel-engine";
import {
  ColumnMapping, PdfStyle, RuleConfig,
  EMPTY_MAPPING, DEFAULT_PDF_STYLE, DEFAULT_RULES,
} from "@/lib/template-types";
import { WorkbookExplorer } from "@/components/designer/workbook-explorer";
import { SheetDataGrid } from "@/components/designer/sheet-data-grid";
import { ColumnDetails } from "@/components/designer/column-details";
import { MappingCanvas } from "@/components/designer/mapping-canvas";
import { TemplateDesigner } from "@/components/designer/template-designer";
import { RulesEngine } from "@/components/designer/rules-engine";
import { PdfPreview } from "@/components/designer/pdf-preview";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";

type ActiveModule = "excel" | "mapping" | "template" | "rules" | "preview";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Generate PDFs", href: "/generate", icon: FileUp },
  { name: "Jobs History", href: "/jobs", icon: List },
  { name: "Banks Configurations", href: "/banks", icon: Landmark },
  { name: "Template Designer", href: "/designer", icon: FlaskConical },
];

const MODULE_TABS: { id: ActiveModule; label: string; shortLabel: string; icon: React.ElementType; badge?: (ctx: TabBadgeCtx) => string | null }[] = [
  { id: "excel", label: "Excel Engine", shortLabel: "M1", icon: Database },
  { id: "mapping", label: "Data Mapping", shortLabel: "M2", icon: Link2, badge: ({ colCount }) => colCount > 0 ? String(colCount) : null },
  { id: "template", label: "Template Design", shortLabel: "M3", icon: Palette },
  { id: "rules", label: "Rules & Grouping", shortLabel: "M4", icon: SlidersHorizontal, badge: ({ ruleCount }) => ruleCount > 0 ? String(ruleCount) : null },
  { id: "preview", label: "Preview & Generate", shortLabel: "M5", icon: Eye },
];

interface TabBadgeCtx { colCount: number; ruleCount: number }

function NavItem({ item, onClick }: { item: typeof navigation[0]; onClick?: () => void }) {
  const [location] = useLocation();
  const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
  return (
    <Link href={item.href} onClick={onClick}
      className={cn("flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
        isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
      <item.icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
      {item.name}
    </Link>
  );
}

export default function DesignerPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeModule, setActiveModule] = useState<ActiveModule>("excel");

  const [workbook, setWorkbook] = useState<WorkbookData | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSheetIdx, setSelectedSheetIdx] = useState(0);
  const [selectedColumnName, setSelectedColumnName] = useState<string | null>(null);

  const [columnMapping, setColumnMapping] = useState<ColumnMapping>(EMPTY_MAPPING);
  const [pdfStyle, setPdfStyle] = useState<PdfStyle>(DEFAULT_PDF_STYLE);
  const [rules, setRules] = useState<RuleConfig>(DEFAULT_RULES);
  const [templateName, setTemplateName] = useState("Untitled Template");
  const [templateDescription, setTemplateDescription] = useState("");
  const [savedTemplateId, setSavedTemplateId] = useState<number | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast({ title: "Invalid file", description: "Please upload an Excel (.xlsx/.xls) file.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    setSelectedColumnName(null);
    try {
      const data = await parseWorkbook(file);
      setWorkbook(data);
      setOriginalFile(file);
      setSelectedSheetIdx(0);
      toast({ title: "Workbook loaded", description: `${data.sheets.length} sheets, ${data.totalRows.toLocaleString()} total rows` });
    } catch (err: any) {
      toast({ title: "Failed to parse file", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleSelectColumn = (colName: string, sheetIdx: number) => {
    setSelectedSheetIdx(sheetIdx);
    setSelectedColumnName(colName);
  };

  const handleSelectSheet = (idx: number) => {
    setSelectedSheetIdx(idx);
    setSelectedColumnName(null);
  };

  const currentSheet = workbook?.sheets[selectedSheetIdx];
  const colCount = columnMapping.tableColumns.length;
  const ruleCount = rules.sortRules.length + rules.filters.length;
  const tabCtx: TabBadgeCtx = { colCount, ruleCount };

  const showLeftPanel = activeModule !== "template" && activeModule !== "rules";
  const showRightPanel = activeModule === "excel";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <input type="file" ref={fileInputRef} accept=".xlsx,.xls,.csv" className="hidden" onChange={handleInputChange} />

      <aside className="hidden lg:flex w-56 xl:w-64 flex-col border-r bg-card h-full shrink-0">
        <div className="p-5 border-b">
          <div className="flex items-center gap-2 text-primary font-bold text-lg tracking-tight">
            <div className="h-8 w-8 bg-primary text-primary-foreground flex items-center justify-center rounded font-mono text-sm">PDF</div>
            AuditGen
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Professional Audit Reporting</p>
        </div>
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navigation.map(item => <NavItem key={item.name} item={item} />)}
        </nav>
        <div className="p-4 border-t">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            System Online
          </div>
        </div>
      </aside>

      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b h-12 flex items-center px-4">
        <div className="flex items-center gap-2 text-primary font-bold flex-1">
          <div className="h-7 w-7 bg-primary text-primary-foreground flex items-center justify-center rounded font-mono text-xs">PDF</div>
          AuditGen
        </div>
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"><Menu className="h-4 w-4" /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-56 p-0">
            <SheetHeader className="p-5 pb-4 border-b">
              <SheetTitle className="flex items-center gap-2 text-primary font-bold">
                <div className="h-7 w-7 bg-primary text-primary-foreground flex items-center justify-center rounded font-mono text-xs">PDF</div>
                AuditGen
              </SheetTitle>
            </SheetHeader>
            <nav className="px-3 py-3 space-y-0.5">
              {navigation.map(item => <NavItem key={item.name} item={item} onClick={() => setMobileNavOpen(false)} />)}
            </nav>
          </SheetContent>
        </Sheet>
      </header>

      <div className="flex-1 flex flex-col min-w-0 lg:pt-0 pt-12">
        <div className="flex items-center justify-between border-b bg-card shrink-0 h-10">
          <div className="flex items-center h-full gap-0 px-2">
            <FlaskConical className="h-3.5 w-3.5 text-primary mx-2 shrink-0" />
            {MODULE_TABS.map(tab => {
              const badge = tab.badge?.(tabCtx);
              return (
                <button key={tab.id} onClick={() => setActiveModule(tab.id)}
                  className={cn("flex items-center gap-1.5 px-3 h-full border-b-2 text-xs font-medium transition-colors whitespace-nowrap",
                    activeModule === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30")}>
                  <tab.icon className="h-3 w-3 shrink-0" />
                  <span className="hidden md:inline">{tab.label}</span>
                  <span className="md:hidden">{tab.shortLabel}</span>
                  {badge && (
                    <span className="ml-0.5 bg-primary/15 text-primary text-[9px] px-1.5 py-0.5 rounded-full font-bold leading-none">{badge}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 px-3">
            {workbook && (
              <span className="text-xs text-muted-foreground hidden lg:block truncate max-w-[200px]">
                {workbook.fileName} · {workbook.sheets.length}s · {workbook.totalRows.toLocaleString()}r
              </span>
            )}
            <Button size="sm" variant={workbook ? "outline" : "default"} className="gap-1.5 h-7 text-xs"
              onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
              {isLoading ? <><Loader2 className="h-3 w-3 animate-spin" /> Parsing…</> : <><Upload className="h-3 w-3" /> {workbook ? "Replace" : "Upload Excel"}</>}
            </Button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {showLeftPanel && (
            <div className="w-52 xl:w-60 border-r flex flex-col shrink-0 bg-card overflow-hidden">
              <WorkbookExplorer
                workbook={workbook}
                selectedSheetIdx={selectedSheetIdx}
                selectedColumnName={selectedColumnName}
                draggable={activeModule === "mapping"}
                onSelectSheet={handleSelectSheet}
                onSelectColumn={handleSelectColumn}
                onUploadClick={() => fileInputRef.current?.click()}
              />
            </div>
          )}

          <div className="flex-1 flex flex-col min-w-0 overflow-hidden"
            onDragOver={e => e.preventDefault()}
            onDrop={activeModule === "excel" ? handleDrop : undefined}>

            {activeModule === "excel" && (
              !workbook && !isLoading ? (
                <UploadDropZone onUploadClick={() => fileInputRef.current?.click()} onDrop={handleDrop} />
              ) : isLoading ? (
                <LoadingState />
              ) : (
                <SheetDataGrid workbook={workbook} selectedSheetIdx={selectedSheetIdx} selectedColumnName={selectedColumnName} onSelectColumn={handleSelectColumn} />
              )
            )}

            {activeModule === "mapping" && (
              <MappingCanvas workbook={workbook} mapping={columnMapping} onChange={setColumnMapping} />
            )}

            {activeModule === "template" && (
              <TemplateDesigner pdfStyle={pdfStyle} columnMapping={columnMapping} onChange={setPdfStyle} />
            )}

            {activeModule === "rules" && (
              <RulesEngine workbook={workbook} columnMapping={columnMapping} rules={rules} onChange={setRules} />
            )}

            {activeModule === "preview" && (
              <PdfPreview
                workbook={workbook}
                originalFile={originalFile}
                columnMapping={columnMapping}
                pdfStyle={pdfStyle}
                rules={rules}
                templateName={templateName}
                templateDescription={templateDescription}
                onTemplateNameChange={setTemplateName}
                onTemplateDescriptionChange={setTemplateDescription}
                savedTemplateId={savedTemplateId}
                onTemplateSaved={setSavedTemplateId}
              />
            )}
          </div>

          {showRightPanel && (
            <div className="w-60 xl:w-68 border-l flex flex-col shrink-0 bg-card overflow-hidden">
              <div className="px-3 py-2.5 border-b">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Column Inspector</span>
              </div>
              <div className="flex-1 overflow-hidden">
                <ColumnDetails workbook={workbook} selectedSheetIdx={selectedSheetIdx} selectedColumnName={selectedColumnName} />
              </div>
            </div>
          )}

          {activeModule === "mapping" && (
            <div className="w-52 xl:w-60 border-l flex flex-col shrink-0 bg-card overflow-hidden">
              <div className="px-3 py-2.5 border-b">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mapping Summary</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
                <MappingSummarySection title="Document Fields">
                  <SummaryRow label="Group By" value={columnMapping.branchGroupBy?.columnName} />
                  <SummaryRow label="Branch Name" value={columnMapping.branchName?.columnName} />
                  <SummaryRow label="State" value={columnMapping.state?.columnName} />
                </MappingSummarySection>
                <MappingSummarySection title={`Table Columns (${colCount})`}>
                  {colCount === 0 ? (
                    <p className="text-muted-foreground italic">None configured</p>
                  ) : (
                    columnMapping.tableColumns.slice(0, 12).map((c, i) => (
                      <div key={c.id} className="flex items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground font-mono w-4 text-right shrink-0">{i + 1}</span>
                        <span className="truncate font-medium flex-1">{c.header}</span>
                        <span className="text-muted-foreground shrink-0 text-[10px]">{c.isBlank || !c.source ? "blank" : `←${c.source.columnName.slice(0, 8)}`}</span>
                      </div>
                    ))
                  )}
                  {colCount > 12 && <p className="text-muted-foreground text-center">+{colCount - 12} more</p>}
                </MappingSummarySection>
                {colCount > 0 && (
                  <Button size="sm" className="w-full h-7 text-xs" onClick={() => setActiveModule("template")}>
                    Next: Template Design →
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border-t bg-muted/20 px-4 py-1 flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">
            {activeModule === "excel" && "Module 1 — Excel Data Engine: Upload and explore your workbook data."}
            {activeModule === "mapping" && "Module 2 — Data Mapping: Drag columns from the workbook to assign PDF fields."}
            {activeModule === "template" && "Module 3 — Template Design: Configure visual PDF layout, colors, fonts, and page settings."}
            {activeModule === "rules" && "Module 4 — Rules & Grouping: Sort, filter, and configure how data is grouped into PDFs."}
            {activeModule === "preview" && "Module 5 — Preview & Generate: Preview branch PDFs and generate all branch PDFs in one click."}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {MODULE_TABS.map((tab) => (
              <button key={tab.id} onClick={() => setActiveModule(tab.id)}
                className={cn("h-1.5 rounded-full transition-all", activeModule === tab.id ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50")}
                title={tab.label} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MappingSummarySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold uppercase tracking-wider text-muted-foreground mb-2 text-[10px]">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-muted-foreground w-20 shrink-0 truncate">{label}</span>
      {value ? <span className="font-mono font-medium truncate">{value}</span> : <span className="italic text-muted-foreground/60">not set</span>}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-sm font-medium">Parsing workbook…</p>
      <p className="text-xs text-muted-foreground">Analyzing columns, types, and statistics</p>
    </div>
  );
}

function UploadDropZone({ onUploadClick, onDrop }: { onUploadClick: () => void; onDrop: (e: React.DragEvent) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div
        className={cn("w-full max-w-lg border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200 cursor-pointer",
          isDragging ? "border-primary bg-primary/5 scale-[1.02]" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/20")}
        onClick={onUploadClick}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { setIsDragging(false); onDrop(e); }}>
        <div className={cn("h-16 w-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors", isDragging ? "bg-primary/20" : "bg-muted")}>
          <FileSpreadsheet className={cn("h-8 w-8", isDragging ? "text-primary" : "text-muted-foreground")} />
        </div>
        <h3 className="font-semibold text-base mb-1">{isDragging ? "Drop your Excel file here" : "Upload an Excel file to begin"}</h3>
        <p className="text-sm text-muted-foreground mb-5">Supports <span className="font-mono">.xlsx</span> and <span className="font-mono">.xls</span> — all sheets parsed automatically</p>
        <Button variant={isDragging ? "default" : "outline"} onClick={e => { e.stopPropagation(); onUploadClick(); }}>
          <Upload className="h-4 w-4 mr-2" /> Browse Files
        </Button>
        <div className="mt-6 grid grid-cols-5 gap-2 text-left">
          {[
            { icon: "1", label: "Excel Engine", desc: "Parse & explore" },
            { icon: "2", label: "Data Mapping", desc: "Assign columns" },
            { icon: "3", label: "Template", desc: "Design PDF" },
            { icon: "4", label: "Rules", desc: "Filter & sort" },
            { icon: "5", label: "Generate", desc: "Export PDFs" },
          ].map(f => (
            <div key={f.icon} className="bg-muted/50 rounded-lg p-2 text-center">
              <div className="h-5 w-5 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center mx-auto mb-1">{f.icon}</div>
              <p className="text-[10px] font-medium">{f.label}</p>
              <p className="text-[9px] text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
