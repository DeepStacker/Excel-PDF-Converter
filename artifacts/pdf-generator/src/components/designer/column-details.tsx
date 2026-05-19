import { Copy, Hash, AlignLeft, Calendar, ToggleLeft, HelpCircle, TrendingUp, Percent, Layers, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkbookData, ColumnMeta, InferredType, TYPE_COLORS } from "@/lib/excel-engine";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

interface ColumnDetailsProps {
  workbook: WorkbookData | null;
  selectedSheetIdx: number;
  selectedColumnName: string | null;
}

function TypeIcon({ type }: { type: InferredType }) {
  const props = { className: "h-5 w-5" };
  switch (type) {
    case "number": return <Hash {...props} />;
    case "text": return <AlignLeft {...props} />;
    case "date": return <Calendar {...props} />;
    case "boolean": return <ToggleLeft {...props} />;
    default: return <HelpCircle {...props} />;
  }
}

export function ColumnDetails({ workbook, selectedSheetIdx, selectedColumnName }: ColumnDetailsProps) {
  const { toast } = useToast();

  if (!workbook || !selectedColumnName) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-4 text-center">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <MousePointerClick className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">Column Inspector</p>
          <p className="text-xs text-muted-foreground mt-1">
            Click any column header or column name to inspect its data quality and statistics.
          </p>
        </div>
      </div>
    );
  }

  const sheet = workbook.sheets[selectedSheetIdx];
  if (!sheet) return null;

  const col = sheet.columns.find(c => c.name === selectedColumnName);
  if (!col) return null;

  const tc = TYPE_COLORS[col.inferredType];
  const filled = col.totalCount - col.nullCount;

  const copyName = async () => {
    await navigator.clipboard.writeText(col.name);
    toast({ title: "Copied!", description: `"${col.name}" copied to clipboard` });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-4 py-4 border-b">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base truncate" title={col.name}>{col.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              from <span className="font-medium" style={{ color: sheet.color }}>{sheet.name}</span>
              {" "}· column {col.index + 1}
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-7 gap-1 shrink-0" onClick={copyName}>
            <Copy className="h-3 w-3" />
            Copy
          </Button>
        </div>

        <div className={cn("mt-3 flex items-center gap-2 px-3 py-2 rounded-lg", tc.bg)}>
          <span className={tc.text}>
            <TypeIcon type={col.inferredType} />
          </span>
          <div>
            <p className={cn("text-sm font-semibold", tc.text)}>{TYPE_COLORS[col.inferredType].label}</p>
            <p className={cn("text-xs opacity-80", tc.text)}>Inferred data type</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        <Section title="Data Quality">
          <StatRow label="Total Rows" value={col.totalCount.toLocaleString()} />
          <StatRow label="Filled" value={filled.toLocaleString()} />
          <StatRow label="Empty / Null" value={col.nullCount.toLocaleString()} highlight={col.nullCount > 0} />
          <div className="mt-2 space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Fill Rate</span>
              <span className={cn("font-medium", col.fillRate < 50 ? "text-destructive" : col.fillRate < 80 ? "text-yellow-600" : "text-green-600")}>
                {col.fillRate}%
              </span>
            </div>
            <Progress
              value={col.fillRate}
              className={cn(
                "h-2",
                col.fillRate < 50
                  ? "[&>div]:bg-destructive"
                  : col.fillRate < 80
                    ? "[&>div]:bg-yellow-500"
                    : "[&>div]:bg-green-500"
              )}
            />
          </div>
        </Section>

        <Separator />

        <Section title="Uniqueness">
          <StatRow label="Unique Values" value={col.uniqueCount.toLocaleString()} />
          <StatRow
            label="Uniqueness Rate"
            value={filled > 0 ? `${Math.round((col.uniqueCount / filled) * 100)}%` : "—"}
          />
          {col.uniqueCount === filled && filled > 0 && (
            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-1">
              <Layers className="h-3 w-3" /> All values are unique (possible key column)
            </p>
          )}
          {col.uniqueCount === 1 && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">Only one distinct value found</p>
          )}
        </Section>

        {col.numericStats && (
          <>
            <Separator />
            <Section title="Numeric Statistics">
              <StatRow label="Minimum" value={formatNum(col.numericStats.min)} />
              <StatRow label="Maximum" value={formatNum(col.numericStats.max)} />
              <StatRow label="Average" value={formatNum(col.numericStats.avg)} />
              <StatRow label="Sum" value={formatNum(col.numericStats.sum)} />
            </Section>
          </>
        )}

        <Separator />

        <Section title={`Sample Values (${Math.min(col.sampleValues.length, 10)})`}>
          {col.sampleValues.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No values</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {col.sampleValues.slice(0, 10).map((v, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded bg-muted text-xs font-mono truncate max-w-full"
                  title={v}
                >
                  {v.length > 20 ? v.slice(0, 20) + "…" : v}
                </span>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-xs font-medium tabular-nums", highlight && "text-destructive")}>{value}</span>
    </div>
  );
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
