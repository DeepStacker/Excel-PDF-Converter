import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Building2, CheckCircle2, XCircle, Clock, UploadCloud, DownloadCloud, Landmark } from "lucide-react";
import { JobStatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import type { Stats } from "@workspace/api-client-react";

async function fetchStats(signal?: AbortSignal): Promise<Stats> {
  const res = await fetch("/api/stats", { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function Dashboard() {
  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ["/api/stats"],
    queryFn: ({ signal }) => fetchStats(signal),
    staleTime: 30_000,
    retry: 1,
  });

  if (isLoading) {
    return <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => <div key={i} className="h-32 bg-muted rounded-xl"></div>)}
      </div>
    </div>;
  }

  if (isError || !stats) {
    return <div className="text-destructive">Failed to load dashboard statistics.</div>;
  }

  const statCards = [
    { title: "Total Jobs", value: stats.totalJobs, icon: FileText },
    { title: "Completed", value: stats.completedJobs, icon: CheckCircle2, className: "text-green-600 dark:text-green-400" },
    { title: "Failed", value: stats.failedJobs, icon: XCircle, className: "text-destructive" },
    { title: "PDFs Generated", value: stats.totalPdfsGenerated, icon: FileText },
    { title: "Active Banks", value: stats.totalBanks, icon: Building2 },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of PDF generation activity.</p>
        </div>
        <Link href="/generate">
          <Button size="lg" className="font-semibold shadow-sm">
            Generate PDFs
          </Button>
        </Link>
      </div>

      {stats.totalJobs === 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 md:p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">Welcome to AuditGen</h2>
            <p className="text-muted-foreground mt-1">Follow these three steps to generate your first batch of branch PDFs.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-none shadow-md">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-lg mb-4">1</div>
                <h3 className="font-semibold text-lg mb-2">Configure a Bank</h3>
                <p className="text-sm text-muted-foreground mb-4">Set up mapping rules so the system knows how to read your Excel sheets.</p>
                <Button variant="outline" asChild className="w-full">
                  <Link href="/banks/new"><Landmark className="mr-2 h-4 w-4" /> Add Bank</Link>
                </Button>
              </CardContent>
            </Card>
            
            <Card className="border-none shadow-md">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-lg mb-4">2</div>
                <h3 className="font-semibold text-lg mb-2">Upload Excel File</h3>
                <p className="text-sm text-muted-foreground mb-4">Select your bank, upload a data file, and we'll process it automatically.</p>
                <Button variant="outline" asChild className="w-full">
                  <Link href="/generate"><UploadCloud className="mr-2 h-4 w-4" /> Upload File</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center font-bold text-lg mb-4">3</div>
                <h3 className="font-semibold text-lg mb-2">Download PDFs</h3>
                <p className="text-sm text-muted-foreground mb-4">Get a ZIP file containing perfectly formatted PDFs for every branch.</p>
                <Button variant="secondary" disabled className="w-full">
                  <DownloadCloud className="mr-2 h-4 w-4" /> Download
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((stat, i) => (
          <Card key={i} className="shadow-sm border-muted/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.className || "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(stat.value ?? 0).toLocaleString()}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Recent Jobs</h2>
          <Link href="/jobs" className="text-sm text-primary hover:underline font-medium">
            View all jobs
          </Link>
        </div>
        
        <Card className="shadow-sm border-muted/50 overflow-hidden">
          {stats.recentJobs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No recent jobs. Get started by generating PDFs.
            </div>
          ) : (
            <div className="divide-y">
              {stats.recentJobs.map((job) => (
                <div key={job.id} className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between">
                  <div className="flex items-start gap-4">
                    <div className="mt-1">
                      <JobStatusBadge status={job.status} />
                    </div>
                    <div>
                      <Link href={`/jobs/${job.id}`} className="font-semibold text-foreground hover:text-primary hover:underline transition-colors">
                        {job.bankName} - {job.auditType}
                      </Link>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {job.originalFilename}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(job.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{job.fileCount} files</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
