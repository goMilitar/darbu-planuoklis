import { Switch, Route } from "wouter";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import DayPlans from "@/pages/day-plans";
import PlanDetail from "@/pages/plan-detail";
import Employees from "@/pages/employees";
import Analytics from "@/pages/analytics";
import FlexHours from "@/pages/flex-hours";
import MyPlan from "@/pages/my-plan";
import { PendingPlansBlocker } from "@/components/pending-plans-blocker";

function AuthenticatedApp() {
  const { user, isLoading } = useAuth();
  const [seedChecked, setSeedChecked] = useState(false);

  useEffect(() => {
    if (user && !seedChecked) {
      apiRequest("POST", "/api/seed-admin")
        .then((res) => res.json())
        .then((data) => {
          if (data.user) {
            queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
          }
          setSeedChecked(true);
        })
        .catch(() => setSeedChecked(true));
    }
  }, [user, seedChecked]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="h-10 w-10 rounded-md mx-auto" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/auth" component={AuthPage} />
        <Route component={Landing} />
      </Switch>
    );
  }

  if (!seedChecked && user.role !== "owner" && user.role !== "admin") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="h-10 w-10 rounded-md mx-auto" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  const isManager = user.role === "owner" || user.role === "admin";

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 p-2 border-b h-12 shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto">
            <PendingPlansBlocker>
              <Switch>
                <Route path="/" component={isManager ? Dashboard : MyPlan} />
                <Route path="/day-plans" component={DayPlans} />
                <Route path="/plan/:id" component={PlanDetail} />
                <Route path="/employees" component={Employees} />
                {isManager && <Route path="/flex-hours" component={FlexHours} />}
                {user.role === "owner" && <Route path="/analytics" component={Analytics} />}
                <Route component={NotFound} />
              </Switch>
            </PendingPlansBlocker>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthenticatedApp />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
