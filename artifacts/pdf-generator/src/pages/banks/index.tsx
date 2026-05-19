import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Landmark, Columns, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

async function fetchBanks() {
  const res = await fetch("/api/banks");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function deleteBank(id: number) {
  const res = await fetch(`/api/banks/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function BanksList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: banks, isLoading, isError } = useQuery({
    queryKey: ["/api/banks"],
    queryFn: fetchBanks,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBank,
    onSuccess: () => {
      toast({ title: "Bank deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/banks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete bank", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="h-10 w-28 bg-muted rounded animate-pulse" />
        </div>
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (isError) {
    return <div className="text-destructive p-4 border border-destructive/20 rounded-lg bg-destructive/5">Failed to load bank configurations.</div>;
  }

  const bankList = banks ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bank Configurations</h1>
          <p className="text-muted-foreground mt-1">Manage mapping schemas and PDF styles per bank.</p>
        </div>
        <Link href="/banks/new">
          <Button className="shadow-sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Bank
          </Button>
        </Link>
      </div>

      <Card className="shadow-sm border-muted/50 overflow-hidden">
        {bankList.length === 0 ? (
          <div className="p-12 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mx-auto mb-4">
              <Landmark className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-medium text-foreground">No banks configured</h3>
            <p className="text-muted-foreground mt-1 mb-4">Add your first bank configuration to start generating PDFs.</p>
            <Link href="/banks/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Bank
              </Button>
            </Link>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bank Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Table Layout</TableHead>
                <TableHead>Audit Types</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bankList.map((bank: any) => {
                const cols = bank.columnMapping?.columns || [];
                const excelCols = cols.filter((c: any) => c.excelColumn !== null && c.excelColumn !== "").length;
                const blankCols = cols.length - excelCols;
                const pdfStyle = bank.pdfStyle || {};
                const orientation = pdfStyle.pageOrientation || "portrait";
                const headerColor1 = (pdfStyle.headerColors?.[0]) || pdfStyle.headerColor1 || "#FFFF00";
                const headerColor2 = (pdfStyle.headerColors?.[1]) || pdfStyle.headerColor2 || "#4985E8";

                return (
                  <TableRow key={bank.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Landmark className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div>
                          <div>{bank.name}</div>
                          {bank.description && (
                            <div className="text-xs text-muted-foreground font-normal mt-0.5 max-w-[200px] truncate">{bank.description}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">{bank.code}</Badge>
                    </TableCell>
                    <TableCell>
                      {bank.isActive ? (
                        <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-muted text-muted-foreground">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-0.5">
                          {cols.slice(0, 6).map((_: any, i: number) => {
                            const colors = pdfStyle.headerColors || [headerColor1, headerColor2];
                            return (
                              <div
                                key={i}
                                className="w-3 h-5 rounded-sm"
                                style={{ backgroundColor: colors[i % colors.length] || (i % 2 === 0 ? headerColor1 : headerColor2) }}
                              />
                            );
                          })}
                          {cols.length > 6 && <div className="w-3 h-5 rounded-sm bg-muted-foreground/20 flex items-center justify-center text-[8px] text-muted-foreground">+{cols.length - 6}</div>}
                        </div>
                        <div className="text-sm">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Columns className="h-3.5 w-3.5" />
                            <span>{cols.length} cols</span>
                          </div>
                          <div className="text-xs text-muted-foreground capitalize">{orientation}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(bank.auditTypes || []).slice(0, 3).map((t: any) => (
                          <span key={t.code} className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{t.code}</span>
                        ))}
                        {(bank.auditTypes || []).length > 3 && (
                          <span className="text-xs text-muted-foreground">+{bank.auditTypes.length - 3}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/banks/${bank.id}/edit`}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <Edit className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                        </Link>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10">
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete</span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Bank Configuration</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete <strong>{bank.name}</strong>? This will prevent future PDF generation for this bank. Existing jobs will be preserved.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(bank.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                disabled={deleteMutation.isPending}
                              >
                                {deleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
