import { useEffect, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetBank, useCreateBank, useUpdateBank, getListBanksQueryKey, getGetBankQueryKey, getGetStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2, ArrowLeft, GripVertical, FileSpreadsheet, FileBox } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

const columnConfigSchema = z.object({
  header: z.string().min(1, "Header text is required"),
  excelColumn: z.string().nullable().default(null),
  width: z.coerce.number().min(20).max(400).default(80),
  dataType: z.enum(["text", "number"]).default("text"),
  headerColor: z.string().nullable().optional(),
});

const columnMappingSchema = z.object({
  branchGroupBy: z.string().min(1, "Required"),
  branchNameCol: z.string().min(1, "Required"),
  stateCol: z.string().min(1, "Required"),
  columns: z.array(columnConfigSchema).min(1, "At least one column required"),
});

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  code: z.string().min(2, "Code must be at least 2 characters").max(10, "Code is too long"),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  columnMapping: columnMappingSchema,
  pdfStyle: z.object({
    pageOrientation: z.enum(["portrait", "landscape"]),
    headerColor1: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color"),
    headerColor2: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color"),
    fontSize: z.coerce.number().min(6).max(24),
    rowHeight: z.coerce.number().min(10).max(100),
    headerRowHeight: z.coerce.number().min(10).max(100),
  }),
  auditTypes: z.array(z.object({
    code: z.string().min(1, "Required"),
    label: z.string().min(1, "Required"),
  })).min(1, "At least one audit type is required"),
});

type FormValues = z.infer<typeof formSchema>;

const defaultValues: FormValues = {
  name: "",
  code: "",
  description: "",
  isActive: true,
  columnMapping: {
    branchGroupBy: "",
    branchNameCol: "",
    stateCol: "",
    columns: [
      { header: "Prospectno", excelColumn: "Prospectno", width: 101, dataType: "text" },
      { header: "CUID", excelColumn: "CUID", width: 118, dataType: "text" },
      { header: "Tare Weight\nas per Bank", excelColumn: "Tare Weight", width: 60, dataType: "number" },
      { header: "Tare Weight as\nper Audit", excelColumn: null, width: 67, dataType: "text" },
      { header: "Purity Check - 18K and\nabove 18K or Below 18K", excelColumn: null, width: 125, dataType: "text" },
      { header: "Remarks", excelColumn: null, width: 247, dataType: "text" },
    ],
  },
  pdfStyle: {
    pageOrientation: "portrait",
    headerColor1: "#FFFF00",
    headerColor2: "#4985E8",
    fontSize: 10,
    rowHeight: 20,
    headerRowHeight: 22.5,
  },
  auditTypes: [{ code: "POA", label: "Physical Verification" }],
};

export default function BankForm() {
  const [matchEdit, paramsEdit] = useRoute("/banks/:id/edit");
  const isEdit = !!matchEdit;
  const id = isEdit && paramsEdit?.id ? parseInt(paramsEdit.id, 10) : 0;
  
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: bank, isLoading: isLoadingBank } = useGetBank(id, {
    query: { queryKey: getGetBankQueryKey(id), enabled: isEdit && !!id }
  });

  const createMutation = useCreateBank({
    mutation: {
      onSuccess: () => {
        toast({ title: "Bank created successfully" });
        queryClient.invalidateQueries({ queryKey: getListBanksQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
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

  const updateMutation = useUpdateBank({
    mutation: {
      onSuccess: () => {
        toast({ title: "Bank updated successfully" });
        queryClient.invalidateQueries({ queryKey: getListBanksQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBankQueryKey(id) });
        setLocation("/banks");
      },
      onError: (err) => {
        toast({ title: "Failed to update bank", description: err.message, variant: "destructive" });
      }
    }
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const { fields: auditFields, append: appendAudit, remove: removeAudit } = useFieldArray({
    control: form.control,
    name: "auditTypes",
  });

  const { fields: columnFields, append: appendColumn, remove: removeColumn, move: moveColumn } = useFieldArray({
    control: form.control,
    name: "columnMapping.columns",
  });

  const isFormSetRef = useRef(false);

  useEffect(() => {
    if (isEdit && bank && !isFormSetRef.current) {
      form.reset({
        name: bank.name,
        code: bank.code,
        description: bank.description || "",
        isActive: bank.isActive,
        columnMapping: {
          branchGroupBy: bank.columnMapping.branchGroupBy || "",
          branchNameCol: bank.columnMapping.branchNameCol || "",
          stateCol: bank.columnMapping.stateCol || "",
          columns: bank.columnMapping.columns?.map(c => ({
            ...c,
            excelColumn: c.excelColumn || null,
            dataType: c.dataType || "text",
            width: c.width || 80,
            headerColor: c.headerColor || null
          })) || [],
        },
        pdfStyle: {
          pageOrientation: bank.pdfStyle?.pageOrientation || "portrait",
          headerColor1: bank.pdfStyle?.headerColor1 || "#FFFF00",
          headerColor2: bank.pdfStyle?.headerColor2 || "#4985E8",
          fontSize: bank.pdfStyle?.fontSize || 10,
          rowHeight: bank.pdfStyle?.rowHeight || 20,
          headerRowHeight: bank.pdfStyle?.headerRowHeight || 22.5,
        },
        auditTypes: bank.auditTypes || [],
      });
      isFormSetRef.current = true;
    }
  }, [bank, isEdit, form]);

  const onSubmit = (data: FormValues) => {
    // Coerce empty strings to null for excelColumn
    const payload = {
      ...data,
      columnMapping: {
        ...data.columnMapping,
        columns: data.columnMapping.columns.map(col => ({
          ...col,
          excelColumn: col.excelColumn?.trim() ? col.excelColumn : null,
        }))
      }
    };

    if (isEdit) {
      updateMutation.mutate({ id, data: payload as any });
    } else {
      createMutation.mutate({ data: payload as any });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const loadTemplatePOA = () => {
    form.setValue("columnMapping.columns", [
      { header: "Prospectno", excelColumn: "Prospectno", width: 101, dataType: "text" },
      { header: "CUID", excelColumn: "CUID", width: 118, dataType: "text" },
      { header: "Tare Weight\\nas per Bank", excelColumn: "Tare Weight", width: 60, dataType: "number" },
      { header: "Tare Weight as\\nper Audit", excelColumn: null, width: 67, dataType: "text" },
      { header: "Purity Check - 18K and\\nabove 18K or Below 18K", excelColumn: null, width: 125, dataType: "text" },
      { header: "Remarks", excelColumn: null, width: 247, dataType: "text" },
    ]);
  };

  const loadTemplateSimple = () => {
    form.setValue("columnMapping.columns", [
      { header: "ID", excelColumn: "ID", width: 80, dataType: "text" },
      { header: "Description", excelColumn: "Description", width: 150, dataType: "text" },
      { header: "Notes", excelColumn: null, width: 200, dataType: "text" },
    ]);
  };

  if (isEdit && isLoadingBank) {
    return <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded"></div>
      <div className="h-screen bg-muted rounded-xl"></div>
    </div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/banks")} className="shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{isEdit ? "Edit Bank Configuration" : "New Bank Configuration"}</h1>
          <p className="text-muted-foreground mt-1">Configure Excel column mappings and PDF styling.</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          <Card className="shadow-sm border-muted/50">
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Bank Name</FormLabel>
                  <FormControl><Input placeholder="e.g. Acme Bank" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="code" render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. ACME"
                      className="uppercase"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormDescription>Short unique identifier — letters only, no spaces.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl><Input placeholder="Brief notes about this configuration" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="isActive" render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 md:col-span-2">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active Status</FormLabel>
                    <FormDescription>
                      Inactive banks will not appear in the Generate PDFs dropdown.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card className="shadow-sm border-muted/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Column Builder</CardTitle>
                <CardDescription>Define how columns from Excel map to your generated PDFs.</CardDescription>
              </div>
              {!isEdit && (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={loadTemplatePOA}>
                    Template: POA
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={loadTemplateSimple}>
                    Template: Simple
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-muted/30 p-4 rounded-lg border">
                <FormField control={form.control} name="columnMapping.branchGroupBy" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Branch Grouping Column</FormLabel>
                    <FormControl><Input placeholder="e.g. CurrentBranch" {...field} /></FormControl>
                    <FormDescription>Excel column defining separate branches.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="columnMapping.branchNameCol" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Branch Name Column</FormLabel>
                    <FormControl><Input placeholder="e.g. Branch Name" {...field} /></FormControl>
                    <FormDescription>Shown in PDF header.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="columnMapping.stateCol" render={({ field }) => (
                  <FormItem>
                    <FormLabel>State Column</FormLabel>
                    <FormControl><Input placeholder="e.g. State" {...field} /></FormControl>
                    <FormDescription>Shown in PDF header.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-medium text-foreground">PDF Columns</h3>
                <div className="space-y-3">
                  {columnFields.map((field, index) => {
                    const isExcelSource = form.watch(`columnMapping.columns.${index}.excelColumn`) !== null;
                    
                    return (
                      <div 
                        key={field.id} 
                        className={`flex gap-3 items-start p-4 border rounded-xl bg-card transition-colors ${
                          isExcelSource ? "border-l-4 border-l-primary" : "border-l-4 border-l-muted-foreground/30"
                        }`}
                      >
                        <div className="mt-8 text-muted-foreground/50 cursor-grab active:cursor-grabbing">
                          <GripVertical className="h-5 w-5" />
                        </div>
                        
                        <div className="flex-1 grid grid-cols-12 gap-4">
                          <FormField control={form.control} name={`columnMapping.columns.${index}.header`} render={({ field }) => (
                            <FormItem className="col-span-12 md:col-span-3">
                              <FormLabel className="text-xs">PDF Header Text</FormLabel>
                              <FormControl><Input placeholder="Header text (\n for break)" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />

                          <div className="col-span-12 md:col-span-4 flex flex-col gap-2">
                            <Label className="text-xs">Source Mode</Label>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant={isExcelSource ? "default" : "outline"}
                                size="sm"
                                className="w-full"
                                onClick={() => form.setValue(`columnMapping.columns.${index}.excelColumn`, "")}
                              >
                                <FileSpreadsheet className="h-4 w-4 mr-2" /> From Excel
                              </Button>
                              <Button
                                type="button"
                                variant={!isExcelSource ? "secondary" : "outline"}
                                size="sm"
                                className="w-full"
                                onClick={() => {
                                  form.setValue(`columnMapping.columns.${index}.excelColumn`, null);
                                  form.clearErrors(`columnMapping.columns.${index}.excelColumn`);
                                }}
                              >
                                <FileBox className="h-4 w-4 mr-2" /> Blank (Hand-fill)
                              </Button>
                            </div>

                            {isExcelSource ? (
                              <FormField control={form.control} name={`columnMapping.columns.${index}.excelColumn`} render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input placeholder="Excel Column Name" value={field.value || ""} onChange={field.onChange} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )} />
                            ) : (
                              <div className="text-xs text-muted-foreground mt-2 text-center bg-muted/30 py-1.5 rounded border">
                                Empty in PDF for manual entry
                              </div>
                            )}
                          </div>

                          <FormField control={form.control} name={`columnMapping.columns.${index}.width`} render={({ field }) => (
                            <FormItem className="col-span-6 md:col-span-2">
                              <FormLabel className="text-xs">Width (pt)</FormLabel>
                              <FormControl><Input type="number" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />

                          <FormField control={form.control} name={`columnMapping.columns.${index}.dataType`} render={({ field }) => (
                            <FormItem className="col-span-6 md:col-span-2">
                              <FormLabel className="text-xs">Data Type</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                <SelectContent>
                                  <SelectItem value="text">Text</SelectItem>
                                  <SelectItem value="number">Number</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />

                          <FormField control={form.control} name={`columnMapping.columns.${index}.headerColor`} render={({ field }) => (
                            <FormItem className="col-span-12 md:col-span-1">
                              <FormLabel className="text-xs">Color</FormLabel>
                              <FormControl>
                                <div className="flex h-10 w-full rounded-md border items-center p-1 cursor-pointer overflow-hidden relative">
                                  <input 
                                    type="color" 
                                    value={field.value || "#ffffff"} 
                                    onChange={field.onChange} 
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  />
                                  <div className="w-full h-full rounded-sm border shadow-sm" style={{ backgroundColor: field.value || "transparent" }} />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </div>

                        <div className="mt-8">
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="text-destructive shrink-0 hover:bg-destructive/10" 
                            onClick={() => removeColumn(index)}
                            disabled={columnFields.length === 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full mt-4" 
                  onClick={() => appendColumn({ header: "", excelColumn: "", width: 80, dataType: "text" })}
                >
                  <Plus className="h-4 w-4 mr-2" /> Add Column
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card className="shadow-sm border-muted/50">
              <CardHeader>
                <CardTitle>PDF Styling</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="pdfStyle.pageOrientation" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Orientation</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="portrait">Portrait</SelectItem>
                        <SelectItem value="landscape">Landscape</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="pdfStyle.headerColor1" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Header Color 1</FormLabel>
                      <div className="flex gap-2">
                        <div className="w-10 h-10 rounded border shrink-0" style={{ backgroundColor: field.value }}></div>
                        <FormControl><Input {...field} /></FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="pdfStyle.headerColor2" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Header Color 2</FormLabel>
                      <div className="flex gap-2">
                        <div className="w-10 h-10 rounded border shrink-0" style={{ backgroundColor: field.value }}></div>
                        <FormControl><Input {...field} /></FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="pdfStyle.fontSize" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Font Size (pt)</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="pdfStyle.rowHeight" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Row Height (pt)</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="pdfStyle.headerRowHeight" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Header Row Height (pt)</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-muted/50 flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle>Audit Types</CardTitle>
                  <CardDescription>Available audit categories for this bank.</CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => appendAudit({ code: "", label: "" })}>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto">
                <div className="space-y-4">
                  {auditFields.map((field, index) => (
                    <div key={field.id} className="flex gap-3 items-start">
                      <FormField control={form.control} name={`auditTypes.${index}.code`} render={({ field }) => (
                        <FormItem className="flex-1">
                          {index === 0 && <FormLabel className="text-xs">Code</FormLabel>}
                          <FormControl><Input placeholder="Code" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`auditTypes.${index}.label`} render={({ field }) => (
                        <FormItem className="flex-[2]">
                          {index === 0 && <FormLabel className="text-xs">Label</FormLabel>}
                          <FormControl><Input placeholder="Label" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <div className={index === 0 ? "mt-6" : ""}>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          className="text-destructive shrink-0 hover:bg-destructive/10" 
                          onClick={() => removeAudit(index)}
                          disabled={auditFields.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {form.formState.errors.auditTypes && !Array.isArray(form.formState.errors.auditTypes) && (
                    <p className="text-sm font-medium text-destructive mt-2">{form.formState.errors.auditTypes.message as string}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-4 sticky bottom-4 bg-background/80 backdrop-blur p-4 rounded-xl border shadow-sm">
            <Button type="button" variant="outline" onClick={() => setLocation("/banks")}>Cancel</Button>
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Create Bank Configuration"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
