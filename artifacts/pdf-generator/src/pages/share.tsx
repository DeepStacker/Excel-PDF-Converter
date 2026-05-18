import { useState } from "react";
import { useRoute } from "wouter";
import { useGetSharedJob, getGetSharedJobQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatBytes, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Eye, FileText, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

export default function SharePage() {
  const [match, params] = useRoute("/share/:token");
  const token = params?.token || "";
  const { toast } = useToast();
  const [downloadingZip, setDownloadingZip] = useState(false);

  const { data: job, isLoading, isError } = useGetSharedJob(token, {
    query: {
      queryKey: getGetSharedJobQueryKey(token),
      enabled: !!token,
      retry: false
    }
  });

  const downloadBlob = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      toast({ title: "Download failed", description: (err as Error).message, variant: "destructive" });
    }
  };

  const handleDownloadZip = async () => {
    if (!job?.downloadAllUrl) return;
    setDownloadingZip(true);
    const zipName = `${job.bankName}_${job.auditType}.zip`.replace(/[^a-zA-Z0-9_.-]/g, "_");
    await downloadBlob(job.downloadAllUrl, zipName);
    setDownloadingZip(false);
  };

  const handleDownloadPdf = (downloadUrl: string, filename: string) => {
    downloadBlob(`${downloadUrl}?download=1`, filename);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 p-8 flex flex-col items-center">
        <div className="w-full max-w-5xl space-y-6 animate-pulse">
          <div className="h-12 bg-muted rounded-xl w-1/3"></div>
          <div className="h-24 bg-muted rounded-xl"></div>
          <div className="h-64 bg-muted rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (isError || !job) {
    return (
      <div className="min-h-screen bg-muted/30 p-8 flex items-center justify-center">
        <Card className="w-full max-w-md shadow-sm border-muted/50">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <h2 className="text-xl font-bold tracking-tight">Link Expired or Invalid</h2>
            <p className="text-muted-foreground text-sm">
              This share link has expired or is invalid. Please request a new link from the sender.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="bg-card border-b py-4 px-8 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-primary font-bold text-lg tracking-tight">
            <div className="h-8 w-8 bg-primary text-primary-foreground flex items-center justify-center rounded font-mono">
              PDF
            </div>
            <span>AuditGen <span className="text-muted-foreground font-normal ml-2">Branch Audit Reports</span></span>
          </div>
          
          {job.downloadAllUrl && (
            <Button onClick={handleDownloadZip} disabled={downloadingZip}>
              <Download className="mr-2 h-4 w-4" />
              {downloadingZip ? "Preparing ZIP..." : "Download All (ZIP)"}
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <Card className="shadow-sm border-muted/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">{job.bankName} - {job.auditType}</CardTitle>
              <CardDescription>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 mt-2">
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="font-medium text-foreground">{job.originalFilename}</span>
                  </div>
                  <div className="hidden sm:block text-muted-foreground">•</div>
                  <div>{job.fileCount} files</div>
                  <div className="hidden sm:block text-muted-foreground">•</div>
                  <div>Expires: {job.expiresAt ? formatDate(job.expiresAt) : "No expiry"}</div>
                </div>
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="shadow-sm border-muted/50">
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
                      <TableHead className="text-right">Actions</TableHead>
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
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" asChild title="View PDF">
                              <a href={file.downloadUrl} target="_blank" rel="noreferrer">
                                <Eye className="h-4 w-4" />
                                <span className="sr-only">View</span>
                              </a>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Download PDF"
                              onClick={() => handleDownloadPdf(file.downloadUrl, file.filename)}
                            >
                              <Download className="h-4 w-4" />
                              <span className="sr-only">Download</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  {"No files available."}
                </div>
              )}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
