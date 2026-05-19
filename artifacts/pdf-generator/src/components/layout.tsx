import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, FileUp, List, Landmark, Menu, X, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Generate PDFs", href: "/generate", icon: FileUp },
  { name: "Jobs History", href: "/jobs", icon: List },
  { name: "Banks Configurations", href: "/banks", icon: Landmark },
  { name: "Template Designer", href: "/designer", icon: FlaskConical },
];

function NavItem({ item, onClick }: { item: typeof navigation[0]; onClick?: () => void }) {
  const [location] = useLocation();
  const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));

  return (
    <Link
      key={item.name}
      href={item.href}
      onClick={onClick}
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
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-muted/30">
      {/* Desktop sidebar - hidden on mobile */}
      <aside className="hidden lg:flex w-64 flex-col border-r bg-card h-screen sticky top-0">
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
          {navigation.map((item) => (
            <NavItem key={item.name} item={item} />
          ))}
        </nav>
        <div className="p-4 border-t text-xs text-muted-foreground font-mono">
          System Status: Online
        </div>
      </aside>

      {/* Mobile header with hamburger */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-primary font-bold text-lg tracking-tight">
            <div className="h-8 w-8 bg-primary text-primary-foreground flex items-center justify-center rounded font-mono">
              PDF
            </div>
            AuditGen
          </div>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="p-6 pb-4 border-b">
                <SheetTitle className="flex items-center gap-2 text-primary font-bold text-lg tracking-tight">
                  <div className="h-8 w-8 bg-primary text-primary-foreground flex items-center justify-center rounded font-mono">
                    PDF
                  </div>
                  AuditGen
                </SheetTitle>
              </SheetHeader>
              <nav className="flex-1 px-4 py-4 space-y-1">
                {navigation.map((item) => (
                  <NavItem key={item.name} item={item} onClick={() => setOpen(false)} />
                ))}
              </nav>
              <div className="absolute bottom-4 left-4 right-4 text-xs text-muted-foreground font-mono">
                System Status: Online
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden lg:pt-0 pt-16">
        <div className="flex-1 overflow-auto p-4 lg:p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}