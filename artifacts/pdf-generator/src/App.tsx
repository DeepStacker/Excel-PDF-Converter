import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";

import Dashboard from "@/pages/dashboard";
import Generate from "@/pages/generate";
import JobsList from "@/pages/jobs/index";
import JobDetail from "@/pages/jobs/detail";
import BanksList from "@/pages/banks/index";
import BankForm from "@/pages/banks/form";
import SharePage from "@/pages/share";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/share/:token" component={SharePage} />
      <Route>
        <Layout>
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
