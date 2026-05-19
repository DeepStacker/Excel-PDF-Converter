import { useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, GripVertical, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkbookData } from "@/lib/excel-engine";
import { RuleConfig, SortRule, FilterRule, ColumnMapping } from "@/lib/template-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

function makeId() { return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

const OPERATORS = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "starts_with", label: "starts with" },
  { value: "gt", label: "greater than" },
  { value: "lt", label: "less than" },
  { value: "gte", label: "≥ (gte)" },
  { value: "lte", label: "≤ (lte)" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

interface RulesEngineProps {
  workbook: WorkbookData | null;
  columnMapping: ColumnMapping;
  rules: RuleConfig;
  onChange: (rules: RuleConfig) => void;
}

export function RulesEngine({ workbook, columnMapping, rules, onChange }: RulesEngineProps) {
  const set = <K extends keyof RuleConfig>(key: K, value: RuleConfig[K]) =>
    onChange({ ...rules, [key]: value });

  const allColumns = [
    ...(columnMapping.branchGroupBy ? [columnMapping.branchGroupBy.columnName] : []),
    ...(columnMapping.branchName ? [columnMapping.branchName.columnName] : []),
    ...(columnMapping.state ? [columnMapping.state.columnName] : []),
    ...columnMapping.tableColumns.filter(c => c.source).map(c => c.source!.columnName),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const numericColumns = columnMapping.tableColumns
    .filter(c => (c.dataType === "number" || c.dataType === "currency") && c.source)
    .map(c => c.source!.columnName);

  const availableSheets = workbook?.sheets ?? [];

  const addSort = () => set("sortRules", [...rules.sortRules, { id: makeId(), column: allColumns[0] ?? "", direction: "asc" }]);
  const updateSort = (id: string, patch: Partial<SortRule>) => set("sortRules", rules.sortRules.map(r => r.id === id ? { ...r, ...patch } : r));
  const removeSort = (id: string) => set("sortRules", rules.sortRules.filter(r => r.id !== id));
  const moveSortUp = (idx: number) => {
    if (idx === 0) return;
    const arr = [...rules.sortRules];
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    set("sortRules", arr);
  };
  const moveSortDown = (idx: number) => {
    if (idx === rules.sortRules.length - 1) return;
    const arr = [...rules.sortRules];
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    set("sortRules", arr);
  };

  const addFilter = () => set("filters", [...rules.filters, { id: makeId(), column: allColumns[0] ?? "", operator: "eq", value: "" }]);
  const updateFilter = (id: string, patch: Partial<FilterRule>) => set("filters", rules.filters.map(r => r.id === id ? { ...r, ...patch } : r));
  const removeFilter = (id: string) => set("filters", rules.filters.filter(r => r.id !== id));

  const toggleTotalsCol = (col: string) => {
    const arr = rules.totalsColumns.includes(col)
      ? rules.totalsColumns.filter(c => c !== col)
      : [...rules.totalsColumns, col];
    set("totalsColumns", arr);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-5 py-2.5 border-b bg-muted/10 flex items-center justify-between shrink-0">
        <span className="font-semibold text-sm">Rules & Grouping Engine</span>
        <span className="text-xs text-muted-foreground">
          {rules.sortRules.length} sort rules · {rules.filters.length} filters
        </span>
      </div>

      <div className="flex-1 px-5 py-5 space-y-6 max-w-3xl">
        <Section title="Data Source" icon="🗂️" desc="Choose which sheet provides the primary data.">
          <div className="flex items-center gap-3">
            <Select
              value={rules.dataSheetIndex !== null ? String(rules.dataSheetIndex) : "__auto__"}
              onValueChange={v => set("dataSheetIndex", v === "__auto__" ? null : Number(v))}
            >
              <SelectTrigger className="h-8 text-xs max-w-xs">
                <SelectValue placeholder="Auto-detect best sheet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__" className="text-xs">Auto-detect (recommended)</SelectItem>
                {availableSheets.map(s => (
                  <SelectItem key={s.index} value={String(s.index)} className="text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full inline-block" style={{ backgroundColor: s.color }} />
                      {s.name} ({s.rowCount.toLocaleString()} rows)
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!workbook && <span className="text-xs text-muted-foreground">Upload a workbook in Module 1 first</span>}
          </div>
        </Section>

        <Separator />

        <Section title="Sort Rules" icon="↕️" desc="Sort rows before grouping into branches. Applied in listed order.">
          {rules.sortRules.length === 0 ? (
            <EmptyState text="No sort rules — rows appear in original Excel order." />
          ) : (
            <div className="space-y-2">
              {rules.sortRules.map((rule, idx) => (
                <div key={rule.id} className="flex items-center gap-2 p-2.5 bg-muted/30 rounded-lg border">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveSortUp(idx)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20">
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button onClick={() => moveSortDown(idx)} disabled={idx === rules.sortRules.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-20">
                      <ArrowDown className="h-3 w-3" />
                    </button>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0 w-5 h-5 flex items-center justify-center p-0">{idx + 1}</Badge>
                  <Select value={rule.column} onValueChange={v => updateSort(rule.id, { column: v })}>
                    <SelectTrigger className="h-7 text-xs flex-1">
                      <SelectValue placeholder="Select column…" />
                    </SelectTrigger>
                    <SelectContent>
                      {allColumns.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={rule.direction} onValueChange={v => updateSort(rule.id, { direction: v as "asc" | "desc" })}>
                    <SelectTrigger className="h-7 text-xs w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc" className="text-xs">↑ Ascending</SelectItem>
                      <SelectItem value="desc" className="text-xs">↓ Descending</SelectItem>
                    </SelectContent>
                  </Select>
                  <button onClick={() => removeSort(rule.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs mt-2" onClick={addSort} disabled={allColumns.length === 0}>
            <Plus className="h-3.5 w-3.5" /> Add Sort Rule
          </Button>
        </Section>

        <Separator />

        <Section title="Row Filters" icon="🔍" desc="Exclude rows before grouping. Rows not matching all filters are removed.">
          {rules.filters.length === 0 ? (
            <EmptyState text="No filters — all rows are included." />
          ) : (
            <div className="space-y-2">
              {rules.filters.map((filter, idx) => (
                <div key={filter.id} className="flex items-center gap-2 p-2.5 bg-muted/30 rounded-lg border flex-wrap">
                  <Badge variant="outline" className="text-xs shrink-0">IF</Badge>
                  <Select value={filter.column} onValueChange={v => updateFilter(filter.id, { column: v })}>
                    <SelectTrigger className="h-7 text-xs flex-1 min-w-[120px]">
                      <SelectValue placeholder="Column…" />
                    </SelectTrigger>
                    <SelectContent>
                      {allColumns.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filter.operator} onValueChange={v => updateFilter(filter.id, { operator: v as FilterRule["operator"] })}>
                    <SelectTrigger className="h-7 text-xs w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATORS.map(op => <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {!["is_empty", "is_not_empty"].includes(filter.operator) && (
                    <Input
                      value={filter.value}
                      onChange={e => updateFilter(filter.id, { value: e.target.value })}
                      className="h-7 text-xs w-32"
                      placeholder="Value…"
                    />
                  )}
                  <button onClick={() => removeFilter(filter.id)} className="text-muted-foreground hover:text-destructive ml-auto">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs mt-2" onClick={addFilter} disabled={allColumns.length === 0}>
            <Plus className="h-3.5 w-3.5" /> Add Filter
          </Button>
        </Section>

        <Separator />

        <Section title="Display Options" icon="⚙️" desc="Control what appears in the generated PDF.">
          <div className="space-y-3">
            <ToggleRow label="Show Sr. No. column" desc="Adds a serial number column as the first column" value={rules.showSrNo} onChange={v => set("showSrNo", v)} />
            <ToggleRow label="Skip empty branches" desc="Branches with 0 matching rows are excluded" value={rules.skipEmptyBranches} onChange={v => set("skipEmptyBranches", v)} />
            <ToggleRow label="Page break between branches" desc="Each branch starts on a fresh page" value={rules.pageBreakBetweenBranches} onChange={v => set("pageBreakBetweenBranches", v)} />
          </div>
        </Section>

        <Separator />

        <Section title="Totals Row" icon="Σ" desc="Appends a totals row at the bottom of each branch table.">
          <ToggleRow label="Show Totals Row" desc="Sums numeric columns at the bottom" value={rules.showTotalsRow} onChange={v => set("showTotalsRow", v)} />
          {rules.showTotalsRow && (
            <div className="mt-3">
              <Label className="text-xs text-muted-foreground mb-2 block">Select columns to sum:</Label>
              {numericColumns.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No numeric columns configured in Module 2.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {numericColumns.map(col => (
                    <button
                      key={col}
                      onClick={() => toggleTotalsCol(col)}
                      className={cn(
                        "px-2.5 py-1 rounded text-xs border transition-colors",
                        rules.totalsColumns.includes(col)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/30 hover:bg-muted text-foreground"
                      )}
                    >
                      {col}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, icon, desc, children }: { title: string; icon: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <span>{icon}</span> {title}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 py-2 px-3 rounded bg-muted/20 border border-dashed border-muted-foreground/25">
      <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

function ToggleRow({ label, desc, value, onChange }: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <span className="text-sm font-medium">{label}</span>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
