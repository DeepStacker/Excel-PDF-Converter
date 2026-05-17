import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { ErrorBoundary } from "@/components/error-boundary";
import { queryClient } from "@/lib/query-client";
import Dashboard from "@/pages/dashboard";
import Generate  from "@/pages/generate";
import JobsList  from "@/pages/jobs/index";
import JobDetail from "@/pages/jobs/detail";
import BanksList from "@/pages/banks/index";
import BankForm  from "@/pages/banks/form";
import SharePage from "@/pages/share";
import NotFound  from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/share/:token">
        <ErrorBoundary>
          <SharePage />
        </ErrorBoundary>
      </Route>
      <Route>
        <Layout>
          <ErrorBoundary>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/generate" component={Generate} />
              <Route path="/jobs" component={JobsList} />
              <Route path="/jobs/:id" component={JobDetail} />
              <Route path="/banks" component={BanksList} />
              <Route path="/banks/new" component={BankForm} />
              <Route path="/banks/:id/edit" component={BankForm} />
              <Route component={NotFound} />
            </Switch>
          </ErrorBoundary>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
