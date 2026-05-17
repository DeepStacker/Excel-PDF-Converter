import { Link, useLocation } from "wouter";
import { LayoutDashboard, FileUp, List, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Generate PDFs", href: "/generate", icon: FileUp },
  { name: "Jobs History", href: "/jobs", icon: List },
  { name: "Banks Configurations", href: "/banks", icon: Landmark },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-screen w-full bg-muted/30">
      <aside className="w-64 flex flex-col border-r bg-card h-screen sticky top-0">
        <div className="p-6">
          <div className="flex items-center gap-2 text-primary font-bold text-lg tracking-tight">
            <div className="h-8 w-8 bg-primary text-primary-foreground flex items-center justify-center rounded font-mono">
              PDF
            </div>
            AuditGen
          </div>
          <p className="text-xs text-muted-foreground mt-1">Professional Audit Reporting</p>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t text-xs text-muted-foreground font-mono">
          System Status: Online
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
