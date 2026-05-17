import { Badge } from "@/components/ui/badge";
import { JobStatus } from "@workspace/api-client-react";

export function JobStatusBadge({ status }: { status: JobStatus }) {
  switch (status) {
    case 'pending': 
      return <Badge variant="secondary" className="bg-muted text-muted-foreground">Pending</Badge>;
    case 'processing': 
      return <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Processing</Badge>;
    case 'completed': 
      return <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Completed</Badge>;
    case 'failed': 
      return <Badge variant="destructive">Failed</Badge>;
    default: 
      return <Badge variant="outline">{status}</Badge>;
  }
}
