import { useRoute } from "wouter";
import { useGetJob, useRetryJob, useDeleteJob, getListJobsQueryKey, getGetStatsQueryKey, useCreateShareLink, getGetJobQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { JobStatusBadge } from "@/components/status-badge";
import { formatDate, formatBytes } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, RefreshCw, Trash2, FileText, AlertTriangle, Share2, Copy } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export default function JobDetail() {
  const [match, params] = useRoute("/jobs/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [shareExpiry, setShareExpiry] = useState<string>("never");

  const { data: job, isLoading, isError } = useGetJob(id, {
    query: {
      queryKey: getGetJobQueryKey(id),
      enabled: !!id,
      refetchInterval: (query) => {
        const data = query.state.data;
        return data?.status === 'pending' || data?.status === 'processing' ? 3000 : false;
      }
    }
  });

  const retryMutation = useRetryJob({
    mutation: {
      onSuccess: () => {
        toast({ title: "Job retry initiated" });
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to retry job", description: err.message, variant: "destructive" });
      }
    }
  });

  const deleteMutation = useDeleteJob({
    mutation: {
      onSuccess: () => {
        toast({ title: "Job deleted" });
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
        setLocation("/jobs");
      },
      onError: (err) => {
        toast({ title: "Failed to delete job", description: err.message, variant: "destructive" });
      }
    }
  });

  const shareMutation = useCreateShareLink({
    mutation: {
      onSuccess: (data) => {
        const url = new URL(`/share/${data.token}`, window.location.origin).toString();
        setShareUrl(url);
      },
      onError: (err) => {
        toast({ title: "Failed to create share link", description: err.message, variant: "destructive" });
      }
    }
  });

  const handleCreateShareLink = () => {
    let expiresInHours: number | null = null;
    if (shareExpiry === "24h") expiresInHours = 24;
    else if (shareExpiry === "7d") expiresInHours = 168;
    else if (shareExpiry === "30d") expiresInHours = 720;
    
    shareMutation.mutate({ id, data: { expiresInHours } });
  };

  const copyShareUrl = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        toast({ title: "Share link copied to clipboard" });
      });
    }
  };

  const openShareDialog = () => {
    setShareUrl(null);
    setShareExpiry("never");
    setIsShareDialogOpen(true);
  };

  if (isLoading) {
    return <div className="space-y-6 animate-pulse">
      <div className="h-24 bg-muted rounded-xl"></div>
      <div className="h-64 bg-muted rounded-xl"></div>
    </div>;
  }

  if (isError || !job) {
    return <div className="text-destructive">Failed to load job details.</div>;
  }

  const isWorking = job.status === 'pending' || job.status === 'processing';
  
  let progress = 0;
  if (job.status === 'completed') progress = 100;
  else if (job.status === 'processing') progress = 50;
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Job #{job.id}</h1>
            <JobStatusBadge status={job.status} />
          </div>
          <p className="text-muted-foreground mt-1">
            {job.bankName} - {job.auditType} • {formatDate(job.createdAt)}
          </p>
        </div>
        
        <div className="flex gap-2">
          {job.status === 'failed' && (
            <Button variant="outline" onClick={() => retryMutation.mutate({ id })} disabled={retryMutation.isPending}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry Job
            </Button>
          )}
          <Button variant="destructive" onClick={() => deleteMutation.mutate({ id })} disabled={deleteMutation.isPending}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {job.errorMessage && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Job Failed</AlertTitle>
          <AlertDescription>{job.errorMessage}</AlertDescription>
        </Alert>
      )}

      {isWorking && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex justify-between text-sm font-medium">
                <span>{job.status === 'pending' ? 'Queued for processing...' : 'Generating PDFs...'}</span>
                {job.status === 'processing' && <span className="animate-pulse">Processing</span>}
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 shadow-sm border-muted/50 h-fit">
          <CardHeader>
            <CardTitle className="text-lg">Job Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <span className="text-muted-foreground block mb-1">Source File</span>
              <div className="flex items-center gap-2 font-medium">
                <FileText className="h-4 w-4 text-primary" />
                <span className="break-all">{job.originalFilename}</span>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground block mb-1">Total Branches (Rows)</span>
              <div className="font-medium">{job.fileCount}</div>
            </div>
            
            {(job.downloadAllUrl || job.status === 'completed') && (
              <div className="pt-4 border-t mt-4 flex flex-col gap-2">
                {job.downloadAllUrl && (
                  <Button className="w-full" asChild>
                    <a href={job.downloadAllUrl} download>
                      <Download className="mr-2 h-4 w-4" />
                      Download All (ZIP)
                    </a>
                  </Button>
                )}
                <Button 
                  variant="secondary" 
                  className="w-full" 
                  onClick={openShareDialog}
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  Share Files
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2 shadow-sm border-muted/50">
          <CardHeader>
            <CardTitle className="text-lg">Generated Files</CardTitle>
            <CardDescription>
              {job.files?.length || 0} PDFs generated for this batch.
            </CardDescription>
          </CardHeader>
          <div className="overflow-x-auto">
            {job.files && job.files.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch Code</TableHead>
                    <TableHead>Branch Name</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {job.files.map((file, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{file.branchCode}</TableCell>
                      <TableCell className="font-medium truncate max-w-[200px]" title={file.branchName}>
                        {file.branchName}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatBytes(file.fileSize)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <a href={file.downloadUrl} target="_blank" rel="noreferrer">
                            <Download className="h-4 w-4" />
                            <span className="sr-only">Download</span>
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-8 text-center text-muted-foreground text-sm">
                {isWorking ? "Waiting for files..." : "No files generated."}
              </div>
            )}
          </div>
        </Card>
      </div>

      <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share This Job</DialogTitle>
            <DialogDescription>
              Anyone with the link can view and download all generated PDFs.
            </DialogDescription>
          </DialogHeader>
          
          {!shareUrl ? (
            <div className="py-4 space-y-6">
              <div className="space-y-3">
                <Label>Link Expiration</Label>
                <RadioGroup value={shareExpiry} onValueChange={setShareExpiry} className="flex flex-col gap-3">
                  <div className="flex items-center space-x-3 bg-muted/30 p-3 rounded border">
                    <RadioGroupItem value="never" id="r1" />
                    <Label htmlFor="r1" className="font-medium cursor-pointer">Never expires</Label>
                  </div>
                  <div className="flex items-center space-x-3 bg-muted/30 p-3 rounded border">
                    <RadioGroupItem value="24h" id="r2" />
                    <Label htmlFor="r2" className="font-medium cursor-pointer">24 hours</Label>
                  </div>
                  <div className="flex items-center space-x-3 bg-muted/30 p-3 rounded border">
                    <RadioGroupItem value="7d" id="r3" />
                    <Label htmlFor="r3" className="font-medium cursor-pointer">7 days</Label>
                  </div>
                  <div className="flex items-center space-x-3 bg-muted/30 p-3 rounded border">
                    <RadioGroupItem value="30d" id="r4" />
                    <Label htmlFor="r4" className="font-medium cursor-pointer">30 days</Label>
                  </div>
                </RadioGroup>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsShareDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateShareLink} disabled={shareMutation.isPending}>
                  {shareMutation.isPending ? "Creating..." : "Create Link"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="py-4 space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 rounded-lg border border-green-200 dark:border-green-800 text-sm mb-4">
                Share link created successfully!
                {shareExpiry !== "never" && <span className="block mt-1 opacity-80">Link expires in {shareExpiry.replace('h', ' hours').replace('d', ' days')}.</span>}
              </div>
              <div className="flex items-center space-x-2">
                <Input 
                  value={shareUrl} 
                  readOnly 
                  className="flex-1"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button onClick={copyShareUrl} size="sm" className="shrink-0">
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Link
                </Button>
              </div>
              <DialogFooter className="mt-4">
                <Button variant="secondary" onClick={() => setIsShareDialogOpen(false)}>Close</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
