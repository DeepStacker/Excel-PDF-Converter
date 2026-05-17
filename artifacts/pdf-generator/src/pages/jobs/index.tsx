import { useListJobs } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { JobStatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import { Link } from "wouter";
import { FileText, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function JobsList() {
  const { data: jobs, isLoading, isError } = useListJobs();

  if (isLoading) {
    return <div className="space-y-4">
      <div className="h-8 w-48 bg-muted rounded"></div>
      <div className="h-96 bg-muted rounded-xl animate-pulse"></div>
    </div>;
  }

  if (isError || !jobs) {
    return <div className="text-destructive">Failed to load jobs.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Jobs History</h1>
        <p className="text-muted-foreground mt-1">Log of all document generation batches.</p>
      </div>

      <Card className="shadow-sm border-muted/50 overflow-hidden">
        {jobs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No jobs found.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Bank / Audit Type</TableHead>
                <TableHead>Source File</TableHead>
                <TableHead>Files</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <JobStatusBadge status={job.status} />
                  </TableCell>
                  <TableCell className="font-medium">
                    {job.bankName}
                    <div className="text-xs text-muted-foreground font-normal mt-0.5">{job.auditType}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm max-w-[200px] truncate" title={job.originalFilename}>
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{job.originalFilename}</span>
                    </div>
                  </TableCell>
                  <TableCell>{job.fileCount}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(job.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/jobs/${job.id}`} className="inline-flex items-center text-sm font-medium text-primary hover:underline">
                      View details
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
