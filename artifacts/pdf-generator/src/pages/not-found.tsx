import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] gap-6 text-center p-8">
      <div className="space-y-2">
        <p className="text-8xl font-bold text-muted-foreground/30">404</p>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-muted-foreground text-sm max-w-xs">
          The page you are looking for doesn't exist or has been moved.
        </p>
      </div>
      <Link href="/">
        <Button>
          <Home className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
      </Link>
    </div>
  );
}
