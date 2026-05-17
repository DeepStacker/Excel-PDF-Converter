import { useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetBank, useCreateBank, useUpdateBank, getListBanksQueryKey, getGetBankQueryKey, getGetStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  code: z.string().min(2, "Code must be at least 2 characters").max(10, "Code is too long"),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  columnMapping: z.object({
    prospectNo: z.string().min(1, "Required"),
    cuid: z.string().min(1, "Required"),
    tareWeight: z.string().min(1, "Required"),
    state: z.string().min(1, "Required"),
    branchCode: z.string().min(1, "Required"),
    branchName: z.string().min(1, "Required"),
  }),
  pdfStyle: z.object({
    pageOrientation: z.enum(["portrait", "landscape"]),
    headerColor1: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color"),
    headerColor2: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color"),
    fontSize: z.coerce.number().min(6).max(24),
    rowHeight: z.coerce.number().min(10).max(100),
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
    prospectNo: "Prospect No",
    cuid: "CUID",
    tareWeight: "Tare Weight",
    state: "State",
    branchCode: "Branch Code",
    branchName: "Branch Name",
  },
  pdfStyle: {
    pageOrientation: "portrait",
    headerColor1: "#FFFF00",
    headerColor2: "#4985E8",
    fontSize: 10,
    rowHeight: 20,
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
      onError: (err) => {
        toast({ title: "Failed to create bank", description: err.message, variant: "destructive" });
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

  const isFormSetRef = useRef(false);

  useEffect(() => {
    if (isEdit && bank && !isFormSetRef.current) {
      form.reset({
        name: bank.name,
        code: bank.code,
        description: bank.description || "",
        isActive: bank.isActive,
        columnMapping: {
          prospectNo: bank.columnMapping.prospectNo,
          cuid: bank.columnMapping.cuid,
          tareWeight: bank.columnMapping.tareWeight,
          state: bank.columnMapping.state,
          branchCode: bank.columnMapping.branchCode,
          branchName: bank.columnMapping.branchName,
        },
        pdfStyle: {
          pageOrientation: bank.pdfStyle?.pageOrientation || "portrait",
          headerColor1: bank.pdfStyle?.headerColor1 || "#FFFF00",
          headerColor2: bank.pdfStyle?.headerColor2 || "#4985E8",
          fontSize: bank.pdfStyle?.fontSize || 10,
          rowHeight: bank.pdfStyle?.rowHeight || 20,
        },
        auditTypes: bank.auditTypes,
      });
      isFormSetRef.current = true;
    }
  }, [bank, isEdit, form]);

  const onSubmit = (data: FormValues) => {
    if (isEdit) {
      updateMutation.mutate({ id, data });
    } else {
      createMutation.mutate({ data });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isEdit && isLoadingBank) {
    return <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded"></div>
      <div className="h-screen bg-muted rounded-xl"></div>
    </div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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
                  <FormControl><Input placeholder="e.g. ACME" className="uppercase" {...field} /></FormControl>
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
            <CardHeader>
              <CardTitle>Column Mapping</CardTitle>
              <CardDescription>Exact names of the columns in the source Excel file.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {['prospectNo', 'cuid', 'tareWeight', 'state', 'branchCode', 'branchName'].map((col) => (
                <FormField key={col} control={form.control} name={`columnMapping.${col}` as any} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="capitalize">{col.replace(/([A-Z])/g, ' $1').trim()}</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              ))}
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
                          className="text-destructive shrink-0" 
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

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => setLocation("/banks")}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Create Bank Configuration"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
