import { Link, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { JobStatusBadge } from "@/components/status-badge";
import { formatDate, formatBytes } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, RefreshCw, Trash2, FileText, AlertTriangle, Share2, Copy, Eye, Search, ArrowUp, ArrowDown, ChevronLeft } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function JobDetail() {
  const [, params] = useRoute("/jobs/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const getUrlParams = () => {
    const p = new URLSearchParams(location.split("?")[1] || "");
    return {
      search: p.get("search") || "",
      sort: (p.get("sort") as "branchName" | "fileSize" | "rowCount") || "branchName",
      dir: (p.get("dir") as "asc" | "desc") || "asc",
    };
  };

  const urlParams = getUrlParams();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [shareExpiry, setShareExpiry] = useState<string>("never");
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [fileSearch, setFileSearch] = useState(urlParams.search);
  const [sortField, setSortField] = useState<"branchName" | "fileSize" | "rowCount">(urlParams.sort);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(urlParams.dir);

  const updateUrlParams = (search: string, sort: string, dir: string) => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (sort && sort !== "branchName") p.set("sort", sort);
    if (dir && dir !== "asc") p.set("dir", dir);
    const qs = p.toString();
    setLocation(`${location.split("?")[0]}${qs ? `?${qs}` : ""}`, { replace: true });
  };

  const { data: job, isLoading, isError } = useQuery({
    queryKey: ["/api/jobs", id],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/jobs/${id}`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!id && id > 0,
    refetchInterval: (query) => {
      const data = query.state.data as any;
      return data?.status === "pending" || data?.status === "processing" ? 1000 : false;
    },
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/jobs/${id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Job retry initiated" });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to retry job", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Job deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setLocation("/jobs");
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete job", description: err.message, variant: "destructive" });
    },
  });

  const shareMutation = useMutation({
    mutationFn: async (payload: { expiresInHours: number | null }) => {
      const res = await fetch(`/api/jobs/${id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: (data) => {
      const url = new URL(`/share/${data.token}`, window.location.origin).toString();
      setShareUrl(url);
    },
    onError: (err: any) => {
      toast({ title: "Failed to create share link", description: err.message, variant: "destructive" });
    },
  });

  const downloadBlob = async (url: string, filename: string, onProgress?: (p: number) => void) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const contentLength = res.headers.get("content-length");
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      if (!res.body || total === 0) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(blobUrl);
        return;
      }
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (onProgress && total > 0) onProgress(Math.round((received / total) * 100));
      }
      const blob = new Blob(chunks as BlobPart[]);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      toast({ title: "Download failed", description: (err as Error).message, variant: "destructive" });
    }
  };

  const handleDownloadZip = async () => {
    if (!job?.downloadAllUrl) return;
    setDownloadingZip(true);
    setDownloadProgress(0);
    const zipName = `${job.bankName}_${job.auditType}_${job.id}.zip`.replace(/[^a-zA-Z0-9_.-]/g, "_");
    await downloadBlob(job.downloadAllUrl, zipName, setDownloadProgress);
    setDownloadingZip(false);
    setDownloadProgress(0);
    toast({ title: "Download complete", description: `${job.fileCount} files downloaded` });
  };

  const handleDownloadPdf = (downloadUrl: string, filename: string) => {
    downloadBlob(`${downloadUrl}?download=1`, filename);
  };

  const handleCreateShareLink = () => {
    let expiresInHours: number | null = null;
    if (shareExpiry === "24h") expiresInHours = 24;
    else if (shareExpiry === "7d") expiresInHours = 168;
    else if (shareExpiry === "30d") expiresInHours = 720;
    shareMutation.mutate({ expiresInHours });
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: "Share link copied to clipboard" });
    } catch {
      toast({ title: "Failed to copy", description: "Please copy the link manually", variant: "destructive" });
    }
  };

  const filteredFiles = useMemo(() => {
    const files = job?.files || [];
    let result = [...files];
    if (fileSearch) {
      const search = fileSearch.toLowerCase();
      result = result.filter((f: any) =>
        f.branchName.toLowerCase().includes(search) || f.branchCode.toLowerCase().includes(search)
      );
    }
    result.sort((a: any, b: any) => {
      let cmp = 0;
      if (sortField === "branchName") cmp = a.branchName.localeCompare(b.branchName);
      else if (sortField === "fileSize") cmp = (a.fileSize ?? 0) - (b.fileSize ?? 0);
      else if (sortField === "rowCount") cmp = (a.rowCount ?? 0) - (b.rowCount ?? 0);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [job?.files, fileSearch, sortField, sortDir]);

  if (isLoading) {
    return <div className="space-y-6 animate-pulse">
      <div className="h-24 bg-muted rounded-xl" />
      <div className="h-64 bg-muted rounded-xl" />
    </div>;
  }

  if (isError || !job) {
    return <div className="text-destructive">Failed to load job details.</div>;
  }

  const isWorking = job.status === "pending" || job.status === "processing";

  return (
    <div className="space-y-6">
      <Link href="/jobs" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-3">
        <ChevronLeft className="h-4 w-4 mr-1" /> Back to Jobs
      </Link>

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
          {job.status === "failed" && (
            <Button variant="outline" onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}>
              <RefreshCw className="mr-2 h-4 w-4" /> Retry Job
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={deleteMutation.isPending}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Job #{job.id}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this job and all {job.fileCount} generated PDF files. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete Job
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {job.errorMessage && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Job Failed</AlertTitle>
          <AlertDescription>{job.errorMessage}</AlertDescription>
        </Alert>
      )}

      {job.daysUntilExpiry != null && job.daysUntilExpiry <= 7 && job.status === "completed" && (
        <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-900/20">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-amber-800 dark:text-amber-300">Files will be deleted soon</AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-400">
            This job's files will be automatically deleted in {job.daysUntilExpiry} day{job.daysUntilExpiry === 1 ? "" : "s"}. Download or share before they expire.
          </AlertDescription>
        </Alert>
      )}

      {isWorking && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex justify-between text-sm font-medium">
                <span>
                  {job.status === "pending" ? "Queued for processing..." : `Processing ${job.processedCount ?? 0} of ${job.fileCount} files...`}
                </span>
                <span className="font-mono text-primary">
                  {job.status === "pending" ? "0" : Math.round(((job.processedCount ?? 0) / job.fileCount) * 100)}%
                </span>
              </div>
              <Progress value={job.status === "pending" ? 0 : Math.round(((job.processedCount ?? 0) / job.fileCount) * 100)} className="h-3" />
              {job.currentFile && job.status === "processing" && (
                <div className="text-xs text-muted-foreground truncate">
                  Current: <span className="font-medium">{job.currentFile}</span>
                </div>
              )}
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
            {(job.downloadAllUrl || job.status === "completed") && (
              <div className="pt-4 border-t mt-4 flex flex-col gap-2">
                {job.downloadAllUrl && (
                  <div className="space-y-2">
                    <Button className="w-full" onClick={handleDownloadZip} disabled={downloadingZip}>
                      <Download className="mr-2 h-4 w-4" />
                      {downloadingZip ? `Downloading... ${downloadProgress}%` : "Download All (ZIP)"}
                    </Button>
                    {downloadingZip && <Progress value={downloadProgress} className="h-1.5" />}
                  </div>
                )}
                <Button variant="secondary" className="w-full" onClick={() => { setShareUrl(null); setShareExpiry("never"); setIsShareDialogOpen(true); }}>
                  <Share2 className="mr-2 h-4 w-4" /> Share Files
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
              {filteredFiles.length !== (job.files?.length || 0) && (
                <span className="ml-2 text-primary">(filtered: {filteredFiles.length})</span>
              )}
            </CardDescription>
          </CardHeader>
          {(job.files?.length ?? 0) > 5 && (
            <div className="px-4 pb-2 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search branches..."
                  value={fileSearch}
                  onChange={(e) => { setFileSearch(e.target.value); updateUrlParams(e.target.value, sortField, sortDir); }}
                  className="pl-10"
                />
              </div>
              <Select value={sortField} onValueChange={(v: any) => { setSortField(v); updateUrlParams(fileSearch, v, sortDir); }}>
                <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="branchName">Name</SelectItem>
                  <SelectItem value="fileSize">Size</SelectItem>
                  <SelectItem value="rowCount">Rows</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => { const d = sortDir === "asc" ? "desc" : "asc"; setSortDir(d); updateUrlParams(fileSearch, sortField, d); }}>
                {sortDir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </Button>
            </div>
          )}
          <div className="overflow-x-auto">
            {filteredFiles.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch Code</TableHead>
                    <TableHead>Branch Name</TableHead>
                    <TableHead>Rows</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFiles.map((file: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{file.branchCode}</TableCell>
                      <TableCell className="font-medium truncate max-w-[200px]" title={file.branchName}>{file.branchName}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{file.rowCount ?? 0}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatBytes(file.fileSize)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" asChild title="View PDF">
                            <a href={file.downloadUrl} target="_blank" rel="noreferrer">
                              <Eye className="h-4 w-4" /><span className="sr-only">View</span>
                            </a>
                          </Button>
                          <Button variant="ghost" size="sm" title="Download PDF" onClick={() => handleDownloadPdf(file.downloadUrl, file.filename)}>
                            <Download className="h-4 w-4" /><span className="sr-only">Download</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-8 text-center text-muted-foreground text-sm">
                {isWorking ? "Waiting for files..." : fileSearch ? "No matching files." : "No files generated."}
              </div>
            )}
          </div>
        </Card>
      </div>

      <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share This Job</DialogTitle>
            <DialogDescription>Anyone with the link can view and download all generated PDFs.</DialogDescription>
          </DialogHeader>
          {!shareUrl ? (
            <div className="py-4 space-y-6">
              <div className="space-y-3">
                <Label>Link Expiration</Label>
                <RadioGroup value={shareExpiry} onValueChange={setShareExpiry} className="flex flex-col gap-3">
                  {[
                    { value: "never", label: "Never expires" },
                    { value: "24h", label: "24 hours" },
                    { value: "7d", label: "7 days" },
                    { value: "30d", label: "30 days" },
                  ].map(({ value, label }, i) => (
                    <div key={value} className="flex items-center space-x-3 bg-muted/30 p-3 rounded border">
                      <RadioGroupItem value={value} id={`r${i}`} />
                      <Label htmlFor={`r${i}`} className="font-medium cursor-pointer">{label}</Label>
                    </div>
                  ))}
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
              <div className="p-4 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 rounded-lg border border-green-200 dark:border-green-800 text-sm">
                Share link created successfully!
                {shareExpiry !== "never" && <span className="block mt-1 opacity-80">Expires in {shareExpiry.replace("h", " hours").replace("d", " days")}.</span>}
              </div>
              <div className="flex items-center space-x-2">
                <Input value={shareUrl} readOnly className="flex-1" onClick={(e) => (e.target as HTMLInputElement).select()} />
                <Button onClick={copyShareUrl} size="sm" className="shrink-0">
                  <Copy className="h-4 w-4 mr-2" /> Copy Link
                </Button>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsShareDialogOpen(false)}>Close</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
