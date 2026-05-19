import { useState, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FileUp, List, Landmark, Menu,
  Upload, Loader2, FileSpreadsheet, FlaskConical,
  ChevronRight, Database, Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseWorkbook, WorkbookData } from "@/lib/excel-engine";
import { WorkbookExplorer } from "@/components/designer/workbook-explorer";
import { SheetDataGrid } from "@/components/designer/sheet-data-grid";
import { ColumnDetails } from "@/components/designer/column-details";
import { MappingCanvas, ColumnMapping, EMPTY_MAPPING } from "@/components/designer/mapping-canvas";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type ActiveModule = "excel" | "mapping";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Generate PDFs", href: "/generate", icon: FileUp },
  { name: "Jobs History", href: "/jobs", icon: List },
  { name: "Banks Configurations", href: "/banks", icon: Landmark },
  { name: "Template Designer", href: "/designer", icon: FlaskConical },
];

const MODULE_TABS: { id: ActiveModule; label: string; icon: React.ElementType; shortLabel: string }[] = [
  { id: "excel", label: "Excel Data Engine", shortLabel: "M1: Excel", icon: Database },
  { id: "mapping", label: "Data Mapping", shortLabel: "M2: Mapping", icon: Link2 },
];

function NavItem({ item, onClick }: { item: typeof navigation[0]; onClick?: () => void }) {
  const [location] = useLocation();
  const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
        isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <item.icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
      {item.name}
    </Link>
  );
}

export default function DesignerPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [workbook, setWorkbook] = useState<WorkbookData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeModule, setActiveModule] = useState<ActiveModule>("excel");

  const [selectedSheetIdx, setSelectedSheetIdx] = useState(0);
  const [selectedColumnName, setSelectedColumnName] = useState<string | null>(null);

  const [columnMapping, setColumnMapping] = useState<ColumnMapping>(EMPTY_MAPPING);

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
      setSelectedSheetIdx(0);
      toast({
        title: "Workbook loaded",
        description: `${data.sheets.length} sheet${data.sheets.length !== 1 ? "s" : ""}, ${data.totalRows.toLocaleString()} total rows`,
      });
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
  const mappedColCount = columnMapping.tableColumns.length;
  const docFieldsCount = [columnMapping.branchGroupBy, columnMapping.branchName, columnMapping.state].filter(Boolean).length;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <input
        type="file"
        ref={fileInputRef}
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleInputChange}
      />

      <aside className="hidden lg:flex w-56 xl:w-64 flex-col border-r bg-card h-full shrink-0">
        <div className="p-5 border-b">
          <div className="flex items-center gap-2 text-primary font-bold text-lg tracking-tight">
            <div className="h-8 w-8 bg-primary text-primary-foreground flex items-center justify-center rounded font-mono text-sm">
              PDF
            </div>
            AuditGen
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Professional Audit Reporting</p>
        </div>
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navigation.map((item) => <NavItem key={item.name} item={item} />)}
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
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-56 p-0">
            <SheetHeader className="p-5 pb-4 border-b">
              <SheetTitle className="flex items-center gap-2 text-primary font-bold">
                <div className="h-7 w-7 bg-primary text-primary-foreground flex items-center justify-center rounded font-mono text-xs">PDF</div>
                AuditGen
              </SheetTitle>
            </SheetHeader>
            <nav className="px-3 py-3 space-y-0.5">
              {navigation.map((item) => <NavItem key={item.name} item={item} onClick={() => setMobileNavOpen(false)} />)}
            </nav>
          </SheetContent>
        </Sheet>
      </header>

      <div className="flex-1 flex flex-col min-w-0 lg:pt-0 pt-12">
        <div className="flex items-center justify-between px-4 py-0 border-b bg-card shrink-0 h-10">
          <div className="flex items-center h-full gap-1">
            <FlaskConical className="h-3.5 w-3.5 text-primary mr-1" />
            {MODULE_TABS.map((tab, i) => (
              <button
                key={tab.id}
                onClick={() => setActiveModule(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 h-full border-b-2 text-xs font-medium transition-colors",
                  activeModule === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon className="h-3 w-3" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
                {tab.id === "mapping" && mappedColCount > 0 && (
                  <span className="ml-1 bg-primary/15 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
                    {mappedColCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {workbook && (
              <span className="text-xs text-muted-foreground hidden md:block">
                {workbook.fileName} · {workbook.sheets.length} sheets · {workbook.totalRows.toLocaleString()} rows
              </span>
            )}
            <Button
              size="sm"
              variant={workbook ? "outline" : "default"}
              className="gap-1.5 h-7 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
            >
              {isLoading
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Parsing…</>
                : <><Upload className="h-3 w-3" /> {workbook ? "Replace" : "Upload Excel"}</>}
            </Button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-56 xl:w-64 border-r flex flex-col shrink-0 bg-card overflow-hidden">
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

          <div
            className="flex-1 flex flex-col min-w-0 overflow-hidden"
            onDragOver={(e) => e.preventDefault()}
            onDrop={activeModule === "excel" ? handleDrop : undefined}
          >
            {activeModule === "excel" && (
              <>
                {!workbook && !isLoading ? (
                  <UploadDropZone onUploadClick={() => fileInputRef.current?.click()} onDrop={handleDrop} />
                ) : isLoading ? (
                  <LoadingState />
                ) : (
                  <SheetDataGrid
                    workbook={workbook}
                    selectedSheetIdx={selectedSheetIdx}
                    selectedColumnName={selectedColumnName}
                    onSelectColumn={handleSelectColumn}
                  />
                )}
              </>
            )}

            {activeModule === "mapping" && (
              <MappingCanvas
                workbook={workbook}
                mapping={columnMapping}
                onChange={setColumnMapping}
              />
            )}
          </div>

          {activeModule === "excel" && (
            <div className="w-64 xl:w-72 border-l flex flex-col shrink-0 bg-card overflow-hidden">
              <div className="px-3 py-2.5 border-b">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Column Inspector</span>
              </div>
              <div className="flex-1 overflow-hidden">
                <ColumnDetails
                  workbook={workbook}
                  selectedSheetIdx={selectedSheetIdx}
                  selectedColumnName={selectedColumnName}
                />
              </div>
            </div>
          )}

          {activeModule === "mapping" && (
            <div className="w-56 xl:w-64 border-l flex flex-col shrink-0 bg-card overflow-hidden">
              <div className="px-3 py-2.5 border-b">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mapping Summary</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
                <SummarySection title="Document Fields">
                  <SummaryRow label="Branch Group By" value={columnMapping.branchGroupBy?.columnName} />
                  <SummaryRow label="Branch Name" value={columnMapping.branchName?.columnName} />
                  <SummaryRow label="State" value={columnMapping.state?.columnName} />
                </SummarySection>

                <SummarySection title={`Table Columns (${mappedColCount})`}>
                  {mappedColCount === 0 ? (
                    <p className="text-muted-foreground italic">None configured</p>
                  ) : (
                    columnMapping.tableColumns.slice(0, 15).map((c, i) => (
                      <div key={c.id} className="flex items-center gap-1.5">
                        <span className="text-muted-foreground font-mono w-4 text-right shrink-0">{i + 1}</span>
                        <span className="truncate font-medium" title={c.header}>{c.header}</span>
                        {c.isBlank || !c.source ? (
                          <span className="ml-auto text-muted-foreground italic shrink-0">blank</span>
                        ) : (
                          <span className="ml-auto text-muted-foreground shrink-0 truncate" title={c.source.columnName}>
                            ←{c.source.columnName}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                  {mappedColCount > 15 && (
                    <p className="text-muted-foreground text-center pt-1">+{mappedColCount - 15} more…</p>
                  )}
                </SummarySection>

                {(columnMapping.branchGroupBy || mappedColCount > 0) && (
                  <div className="pt-2">
                    <Button size="sm" className="w-full h-7 text-xs gap-1" onClick={() => alert("Mapping saved! (Module 3 will use this for PDF template design.)")}>
                      Save Mapping →
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border-t bg-muted/20 px-4 py-1.5 flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">
            {activeModule === "excel"
              ? "Module 1 — Excel Data Engine: Click column headers to inspect data quality and statistics."
              : "Module 2 — Data Mapping: Drag columns from the workbook panel to assign them to PDF fields."
            }
          </span>
        </div>
      </div>
    </div>
  );
}

function SummarySection({ title, children }: { title: string; children: React.ReactNode }) {
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
      <span className="text-muted-foreground w-24 shrink-0 truncate">{label}</span>
      {value ? (
        <span className="font-mono font-medium truncate text-foreground" title={value}>{value}</span>
      ) : (
        <span className="italic text-muted-foreground/60">not set</span>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-sm font-medium">Parsing workbook…</p>
      <p className="text-xs text-muted-foreground">Analyzing columns, data types, and statistics</p>
    </div>
  );
}

function UploadDropZone({ onUploadClick, onDrop }: { onUploadClick: () => void; onDrop: (e: React.DragEvent) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div
        className={cn(
          "w-full max-w-lg border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.02]"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/20 cursor-pointer"
        )}
        onClick={onUploadClick}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { setIsDragging(false); onDrop(e); }}
      >
        <div className={cn(
          "h-16 w-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors",
          isDragging ? "bg-primary/20" : "bg-muted"
        )}>
          <FileSpreadsheet className={cn("h-8 w-8", isDragging ? "text-primary" : "text-muted-foreground")} />
        </div>
        <h3 className="font-semibold text-base mb-1">
          {isDragging ? "Drop your Excel file here" : "Upload an Excel file to begin"}
        </h3>
        <p className="text-sm text-muted-foreground mb-5">
          Supports <span className="font-mono">.xlsx</span> and <span className="font-mono">.xls</span> — all sheets parsed automatically
        </p>
        <Button variant={isDragging ? "default" : "outline"} onClick={(e) => { e.stopPropagation(); onUploadClick(); }}>
          <Upload className="h-4 w-4 mr-2" /> Browse Files
        </Button>
        <div className="mt-6 grid grid-cols-3 gap-3 text-left">
          {[
            { label: "Multi-sheet", desc: "All sheets parsed" },
            { label: "Type inference", desc: "Text / Number / Date" },
            { label: "Data quality", desc: "Null & fill rates" },
          ].map(f => (
            <div key={f.label} className="bg-muted/50 rounded-lg p-2.5">
              <p className="text-xs font-medium">{f.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
