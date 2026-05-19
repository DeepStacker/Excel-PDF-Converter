import { PdfStyle, ColumnMapping, hexToRgb } from "@/lib/template-types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface TemplateDesignerProps {
  pdfStyle: PdfStyle;
  columnMapping: ColumnMapping;
  onChange: (style: PdfStyle) => void;
}

export function TemplateDesigner({ pdfStyle, columnMapping, onChange }: TemplateDesignerProps) {
  const set = <K extends keyof PdfStyle>(key: K, value: PdfStyle[K]) =>
    onChange({ ...pdfStyle, [key]: value });

  const previewCols = columnMapping.tableColumns.slice(0, 6);
  const color1 = hexToRgb(pdfStyle.headerColor1);
  const color2 = hexToRgb(pdfStyle.headerColor2);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 py-2.5 border-b bg-muted/10 flex items-center justify-between shrink-0">
        <span className="font-semibold text-sm">PDF Template Design</span>
        <span className="text-xs text-muted-foreground">Changes apply to all generated PDFs</span>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-72 xl:w-80 border-r overflow-y-auto p-4 space-y-5 shrink-0">
          <Section title="Page Setup">
            <Field label="Page Size">
              <Select value={pdfStyle.pageSize} onValueChange={v => set("pageSize", v as PdfStyle["pageSize"])}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["A4", "Letter", "Legal", "A3"] as const).map(s => (
                    <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Orientation">
              <div className="flex gap-2">
                {(["portrait", "landscape"] as const).map(o => (
                  <button key={o} onClick={() => set("pageOrientation", o)}
                    className={cn("flex-1 py-2 px-3 rounded border text-xs font-medium transition-colors capitalize",
                      pdfStyle.pageOrientation === o ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted")}>
                    {o === "portrait" ? "◻ Portrait" : "▭ Landscape"}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              {(["marginTop", "marginBottom", "marginLeft", "marginRight"] as const).map(m => (
                <Field key={m} label={m.replace("margin", "")} inline>
                  <Input type="number" value={pdfStyle[m]} min={0} max={100}
                    onChange={e => set(m, Number(e.target.value))}
                    className="h-7 text-xs px-2 w-20" />
                  <span className="text-xs text-muted-foreground ml-1">mm</span>
                </Field>
              ))}
            </div>
          </Section>

          <Separator />

          <Section title="Header Colors">
            <Field label="Left Columns Color">
              <div className="flex items-center gap-2">
                <input type="color" value={pdfStyle.headerColor1}
                  onChange={e => set("headerColor1", e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border" />
                <Input value={pdfStyle.headerColor1}
                  onChange={e => set("headerColor1", e.target.value)}
                  className="h-8 text-xs font-mono flex-1" maxLength={7} />
              </div>
            </Field>
            <Field label="Right Columns Color">
              <div className="flex items-center gap-2">
                <input type="color" value={pdfStyle.headerColor2}
                  onChange={e => set("headerColor2", e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border" />
                <Input value={pdfStyle.headerColor2}
                  onChange={e => set("headerColor2", e.target.value)}
                  className="h-8 text-xs font-mono flex-1" maxLength={7} />
              </div>
            </Field>
            <Field label="Alternate Row Color">
              <div className="flex items-center gap-2">
                <input type="color" value={pdfStyle.alternateRowColor}
                  onChange={e => set("alternateRowColor", e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border" />
                <Input value={pdfStyle.alternateRowColor}
                  onChange={e => set("alternateRowColor", e.target.value)}
                  className="h-8 text-xs font-mono flex-1" maxLength={7} />
              </div>
            </Field>
          </Section>

          <Separator />

          <Section title="Typography">
            <Field label="Font Family">
              <Select value={pdfStyle.fontFamily} onValueChange={v => set("fontFamily", v as PdfStyle["fontFamily"])}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["Arial", "Helvetica", "Times New Roman"] as const).map(f => (
                    <SelectItem key={f} value={f} className="text-xs" style={{ fontFamily: f }}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={`Data Font Size (${pdfStyle.fontSize}pt)`}>
              <Slider value={[pdfStyle.fontSize]} min={6} max={14} step={1}
                onValueChange={([v]) => set("fontSize", v)} className="w-full" />
            </Field>
            <Field label={`Header Font Size (${pdfStyle.headerFontSize}pt)`}>
              <Slider value={[pdfStyle.headerFontSize]} min={6} max={14} step={1}
                onValueChange={([v]) => set("headerFontSize", v)} className="w-full" />
            </Field>
          </Section>

          <Separator />

          <Section title="Row Dimensions">
            <Field label={`Header Row Height (${pdfStyle.headerRowHeight}px)`}>
              <Slider value={[pdfStyle.headerRowHeight]} min={14} max={60} step={1}
                onValueChange={([v]) => set("headerRowHeight", v)} className="w-full" />
            </Field>
            <Field label={`Data Row Height (${pdfStyle.rowHeight}px)`}>
              <Slider value={[pdfStyle.rowHeight]} min={14} max={80} step={1}
                onValueChange={([v]) => set("rowHeight", v)} className="w-full" />
            </Field>
          </Section>

          <Separator />

          <Section title="Report Header">
            <Field label="Report Title">
              <Input value={pdfStyle.reportTitle}
                onChange={e => set("reportTitle", e.target.value)}
                className="h-8 text-xs" placeholder="Branch Audit Report" />
            </Field>
            <ToggleRow label="Show Audit Type" value={pdfStyle.showAuditType} onChange={v => set("showAuditType", v)} />
            <ToggleRow label="Show Date" value={pdfStyle.showDate} onChange={v => set("showDate", v)} />
          </Section>

          <Separator />

          <Section title="Footer">
            <ToggleRow label="Show Page Numbers" value={pdfStyle.showPageNumbers} onChange={v => set("showPageNumbers", v)} />
            <Field label="Footer Text">
              <Input value={pdfStyle.footerText}
                onChange={e => set("footerText", e.target.value)}
                className="h-8 text-xs" placeholder="Confidential — Internal Use Only" />
            </Field>
          </Section>
        </div>

        <div className="flex-1 overflow-auto p-6 bg-muted/20 flex flex-col items-center">
          <p className="text-xs text-muted-foreground mb-4">Live PDF Preview — {pdfStyle.pageSize} {pdfStyle.pageOrientation}</p>
          <PdfPreviewCanvas pdfStyle={pdfStyle} columnMapping={columnMapping} />
        </div>
      </div>
    </div>
  );
}

function PdfPreviewCanvas({ pdfStyle, columnMapping }: { pdfStyle: PdfStyle; columnMapping: ColumnMapping }) {
  const isLandscape = pdfStyle.pageOrientation === "landscape";
  const baseW = isLandscape ? 297 : 210;
  const baseH = isLandscape ? 210 : 297;
  const scale = isLandscape ? 660 / baseW : 440 / baseW;
  const w = baseW * scale;
  const h = baseH * scale;
  const mT = pdfStyle.marginTop * scale * 0.8;
  const mR = pdfStyle.marginRight * scale * 0.35;
  const mB = pdfStyle.marginBottom * scale * 0.8;
  const mL = pdfStyle.marginLeft * scale * 0.35;
  const c1 = pdfStyle.headerColor1;
  const c2 = pdfStyle.headerColor2;
  const altRow = pdfStyle.alternateRowColor;
  const previewCols = columnMapping.tableColumns.slice(0, 8);
  const numCols = previewCols.length + 1;
  const colW = Math.max(30, (w - mL - mR) / numCols);

  return (
    <div
      className="bg-white shadow-xl border rounded overflow-hidden"
      style={{ width: w, height: h, fontFamily: pdfStyle.fontFamily, fontSize: pdfStyle.fontSize * scale * 0.55, position: "relative" }}
    >
      <div style={{ position: "absolute", top: mT, left: mL, right: mR, bottom: mB }}>
        <div style={{ borderBottom: "1px solid #ddd", paddingBottom: 4, marginBottom: 4 }}>
          <div style={{ fontWeight: "bold", fontSize: pdfStyle.fontSize * scale * 0.7, color: "#333" }}>{pdfStyle.reportTitle || "Branch Audit Report"}</div>
          <div style={{ display: "flex", gap: 16, marginTop: 2 }}>
            {pdfStyle.showAuditType && <span style={{ fontSize: pdfStyle.fontSize * scale * 0.5, color: "#666" }}>Audit Type: SAMPLE</span>}
            <span style={{ fontSize: pdfStyle.fontSize * scale * 0.5, color: "#666" }}>Branch: 001 — Sample Branch</span>
            <span style={{ fontSize: pdfStyle.fontSize * scale * 0.5, color: "#666" }}>State: XYZ</span>
            {pdfStyle.showDate && <span style={{ fontSize: pdfStyle.fontSize * scale * 0.5, color: "#666" }}>{new Date().toLocaleDateString()}</span>}
          </div>
        </div>

        {previewCols.length > 0 ? (
          <div style={{ overflowX: "hidden" }}>
            <div style={{ display: "flex", borderBottom: "1px solid #999" }}>
              <div style={{ width: colW * 0.4, minWidth: 20, height: pdfStyle.headerRowHeight * scale * 0.55, backgroundColor: c1, border: "0.5px solid #999", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "bold", fontSize: pdfStyle.headerFontSize * scale * 0.45 }}>Sr</div>
              {previewCols.map((col, i) => {
                const bg = i < Math.floor(previewCols.length / 2) ? c1 : c2;
                return (
                  <div key={col.id} style={{ flex: 1, height: pdfStyle.headerRowHeight * scale * 0.55, backgroundColor: bg, border: "0.5px solid #999", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "bold", fontSize: pdfStyle.headerFontSize * scale * 0.45, padding: "0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {col.header.slice(0, 10)}
                  </div>
                );
              })}
            </div>
            {[0, 1, 2, 3].map(r => (
              <div key={r} style={{ display: "flex" }}>
                <div style={{ width: colW * 0.4, minWidth: 20, height: pdfStyle.rowHeight * scale * 0.45, backgroundColor: r % 2 === 1 ? altRow : "white", border: "0.5px solid #eee", display: "flex", alignItems: "center", justifyContent: "center", fontSize: pdfStyle.fontSize * scale * 0.45 }}>{r + 1}</div>
                {previewCols.map((col) => (
                  <div key={col.id} style={{ flex: 1, height: pdfStyle.rowHeight * scale * 0.45, backgroundColor: r % 2 === 1 ? altRow : "white", border: "0.5px solid #eee", display: "flex", alignItems: "center", padding: "0 2px", fontSize: pdfStyle.fontSize * scale * 0.45 }}>
                    <div style={{ height: 4, width: "60%", backgroundColor: "#e0e0e0", borderRadius: 2 }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 8, color: "#aaa", fontSize: pdfStyle.fontSize * scale * 0.55, textAlign: "center", marginTop: 8, border: "1px dashed #ddd", borderRadius: 4 }}>
            Map columns in Module 2 to see table preview
          </div>
        )}

        {(pdfStyle.showPageNumbers || pdfStyle.footerText) && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "space-between", borderTop: "0.5px solid #ddd", paddingTop: 2 }}>
            <span style={{ fontSize: pdfStyle.fontSize * scale * 0.45, color: "#888" }}>{pdfStyle.footerText}</span>
            {pdfStyle.showPageNumbers && <span style={{ fontSize: pdfStyle.fontSize * scale * 0.45, color: "#888" }}>Page 1 of N</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children, inline }: { label: string; children: React.ReactNode; inline?: boolean }) {
  return (
    <div className={cn("space-y-1", inline && "flex items-center gap-2 space-y-0")}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} className="scale-75" />
    </div>
  );
}
