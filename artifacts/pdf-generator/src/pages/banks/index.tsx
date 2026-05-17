import { useListBanks, useDeleteBank, getListBanksQueryKey, getGetStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Landmark, Columns } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function BanksList() {
  const { data: banks, isLoading, isError } = useListBanks();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteMutation = useDeleteBank({
    mutation: {
      onSuccess: () => {
        toast({ title: "Bank deleted successfully" });
        queryClient.invalidateQueries({ queryKey: getListBanksQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to delete bank", description: err.message, variant: "destructive" });
      }
    }
  });

  if (isLoading) {
    return <div className="space-y-4">
      <div className="h-8 w-48 bg-muted rounded"></div>
      <div className="h-96 bg-muted rounded-xl animate-pulse"></div>
    </div>;
  }

  if (isError || !banks) {
    return <div className="text-destructive">Failed to load bank configurations.</div>;
  }

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
        {banks.length === 0 ? (
          <div className="p-12 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mx-auto mb-4">
              <Landmark className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-medium text-foreground">No banks configured</h3>
            <p className="text-muted-foreground mt-1 mb-4">Add your first bank configuration to start generating PDFs.</p>
            <Link href="/banks/new">
              <Button>Add Bank</Button>
            </Link>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bank Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Configuration</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {banks.map((bank) => {
                const cols = bank.columnMapping?.columns || [];
                const excelCols = cols.filter(c => c.excelColumn !== null).length;
                const handCols = cols.length - excelCols;
                
                return (
                  <TableRow key={bank.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Landmark className="h-4 w-4 text-muted-foreground" />
                        {bank.name}
                      </div>
                      {bank.description && <div className="text-xs text-muted-foreground font-normal mt-0.5">{bank.description}</div>}
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
                      <div className="text-sm font-medium flex items-center gap-1.5">
                        <Columns className="h-3.5 w-3.5 text-muted-foreground" />
                        {cols.length} columns <span className="text-xs font-normal text-muted-foreground">({excelCols} Excel, {handCols} Blank)</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {bank.auditTypes.slice(0, 2).map(t => (
                          <span key={t.code} className="text-xs bg-muted px-1.5 py-0.5 rounded">{t.code}</span>
                        ))}
                        {bank.auditTypes.length > 2 && (
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">+{bank.auditTypes.length - 2}</span>
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
                                Are you sure you want to delete {bank.name}? This will prevent future PDF generation for this bank. Existing jobs will be preserved.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate({ id: bank.id })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
