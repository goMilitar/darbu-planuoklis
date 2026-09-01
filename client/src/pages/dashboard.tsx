import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { CalendarDays, Clock, ArrowRight, Plus, TrendingUp, RefreshCw, CheckCircle2 } from "lucide-react";
import type { DayPlan, User } from "@shared/schema";

const STATUS_LABELS: Record<string, string> = {
  planned: "Suplanuotas",
  in_progress: "Vykdomas",
  done: "Atliktas",
  closed: "Uždarytas",
};

const STATUS_COLORS: Record<string, string> = {
  planned: "secondary",
  in_progress: "default",
  done: "default",
  closed: "secondary",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("lt-LT", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function Dashboard() {
  const { user } = useAuth();
  const isManager = user?.role === "owner" || user?.role === "admin";
  const today = todayStr();

  const { data: todayPlans, isLoading: plansLoading } = useQuery<(DayPlan & { employee: User })[]>({
    queryKey: ["/api/day-plans", `?date=${today}`],
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["/api/analytics", `?startDate=${today}&endDate=${today}`],
  });

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  const weekStartStr = weekStart.toISOString().split("T")[0];

  const { data: weekAnalytics } = useQuery({
    queryKey: ["/api/analytics", `?startDate=${weekStartStr}&endDate=${today}`],
  });

  if (plansLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  const summary = (analytics as any)?.summary || {};
  const weekSummary = (weekAnalytics as any)?.summary || {};

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">
            Sveiki, {user?.firstName || "Vartotojau"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{formatDate(today)}</p>
        </div>
        {isManager && (
          <Button asChild data-testid="button-new-plan">
            <Link href="/day-plans">
              <Plus className="mr-2 h-4 w-4" />
              Kurti planą
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-1">
              <div>
                <p className="text-sm text-muted-foreground">Šiandien planai</p>
                <p className="text-2xl font-bold mt-1" data-testid="text-today-plans-count">
                  {todayPlans?.length || 0}
                </p>
              </div>
              <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-1">
              <div>
                <p className="text-sm text-muted-foreground">Atlikimas</p>
                <p className="text-2xl font-bold mt-1" data-testid="text-completion-rate">
                  {summary.completionRate || 0}%
                </p>
              </div>
              <div className="h-10 w-10 rounded-md bg-chart-2/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-chart-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-1">
              <div>
                <p className="text-sm text-muted-foreground">Savaitės atlikimas</p>
                <p className="text-2xl font-bold mt-1" data-testid="text-week-completion">
                  {weekSummary.completionRate || 0}%
                </p>
              </div>
              <div className="h-10 w-10 rounded-md bg-chart-3/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-chart-3" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-1">
              <div>
                <p className="text-sm text-muted-foreground">Perkelta</p>
                <p className="text-2xl font-bold mt-1" data-testid="text-carryover-count">
                  {summary.totalCarryoverIn || 0}
                </p>
              </div>
              <div className="h-10 w-10 rounded-md bg-chart-4/10 flex items-center justify-center">
                <RefreshCw className="h-5 w-5 text-chart-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Šiandienos planai</h2>
        {!todayPlans || todayPlans.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Šiandien planų nėra</p>
              {isManager && (
                <Button asChild className="mt-4" data-testid="button-create-first-plan">
                  <Link href="/day-plans">Sukurti pirmą planą</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {todayPlans.map((plan) => (
              <Link key={plan.id} href={`/plan/${plan.id}`}>
                <Card className="hover-elevate cursor-pointer h-full" data-testid={`card-plan-${plan.id}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">
                        {plan.employee?.firstName} {plan.employee?.lastName}
                      </span>
                      <Badge variant={STATUS_COLORS[plan.status] as any} className="text-xs">
                        {STATUS_LABELS[plan.status] || plan.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{formatDate(plan.date)}</span>
                    </div>
                    <div className="flex items-center justify-end">
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
