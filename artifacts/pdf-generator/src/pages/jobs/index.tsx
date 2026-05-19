import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { JobStatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import { Link } from "wouter";
import { JobStatus } from "@workspace/api-client-react";
import { FileText, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

interface JobListResponse {
  data: Array<{
    id: number;
    bankId: number;
    bankName: string;
    auditType: string;
    status: string;
    originalFilename: string;
    fileCount: number;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
    daysUntilExpiry: number;
    retentionDays: number;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

async function fetchJobs(params: { page: number; limit: number; status?: string }) {
  const searchParams = new URLSearchParams();
  searchParams.set("page", params.page.toString());
  searchParams.set("limit", params.limit.toString());
  if (params.status) searchParams.set("status", params.status);

  const res = await fetch(`/api/jobs?${searchParams.toString()}`);
  if (!res.ok) throw new Error("Failed to load jobs");
  return res.json() as Promise<JobListResponse>;
}

export default function JobsList() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [status, setStatus] = useState("all");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["jobs", "list", page, limit, status],
    queryFn: () => fetchJobs({ page, limit, status: status === "all" ? undefined : status }),
  });

  const jobs = data?.data ?? [];
  const pagination = data?.pagination;

  const handleLimitChange = (value: string) => {
    setLimit(Number(value));
    setPage(1);
  };

  if (isLoading) {
    return <div className="space-y-4">
      <div className="h-8 w-48 bg-muted rounded"></div>
      <div className="h-96 bg-muted rounded-xl animate-pulse"></div>
    </div>;
  }

  if (isError || !data) {
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
          <>
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
                      <JobStatusBadge status={job.status as JobStatus} />
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

            <div className="border-t px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span>
                  Showing {jobs.length} of {pagination?.total ?? 0} jobs
                </span>
                <div className="flex items-center gap-2">
                  <span>Status:</span>
                  <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span>Show:</span>
                  <Select value={limit.toString()} onValueChange={handleLimitChange}>
                    <SelectTrigger className="w-[80px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page === 1}
                    onClick={() => setPage(1)}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm px-2">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage(pagination.totalPages)}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}