import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { CalendarDays, ArrowRight, Clock, ClipboardList, TrendingUp, BarChart3, Target, UserX, Timer, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DayPlan } from "@shared/schema";

interface OpenClockIn {
  id: number;
  date: string;
  workStartedAt: string;
  isToday: boolean;
}

interface OpenClockInsResponse {
  openClockIns: OpenClockIn[];
}

const STATUS_LABELS: Record<string, string> = {
  planned: "Suplanuotas",
  in_progress: "Vykdomas",
  done: "Atliktas",
  closed: "Uždarytas",
};

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function getScoreColor(pct: number) {
  if (pct >= 100) return "text-green-600";
  if (pct >= 80) return "text-yellow-600";
  if (pct >= 60) return "text-orange-600";
  return "text-red-600";
}

function getProgressColor(pct: number) {
  if (pct >= 100) return "[&>div]:bg-green-500";
  if (pct >= 80) return "[&>div]:bg-yellow-500";
  if (pct >= 60) return "[&>div]:bg-orange-500";
  return "[&>div]:bg-red-500";
}

interface MyPerformance {
  totalClosedPlans: number;
  weekAvg: number;
  weekDays: number;
  monthAvg: number;
  monthDays: number;
  overallAvg: number;
  recentDays: { date: string; score: number }[];
  workSchedule?: string;
  workedTime?: {
    weekMinutes: number;
    monthMinutes: number;
    totalMinutes: number;
    weekPlannedMinutes: number;
    monthPlannedMinutes: number;
    totalPlannedMinutes: number;
    recent: { date: string; minutes: number; plannedMinutes: number }[];
  };
  absences?: {
    total: number;
    week: number;
    month: number;
    recent: { date: string; reason: string }[];
  };
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min.`;
  if (m === 0) return `${h} val.`;
  return `${h} val. ${m} min.`;
}

export default function MyPlan() {
  const { user } = useAuth();
  const today = todayStr();

  const { data: plans, isLoading } = useQuery<DayPlan[]>({
    queryKey: ["/api/day-plans", `?employeeId=${user?.id}&startDate=${today}&endDate=${today}`],
    enabled: !!user?.id,
  });

  const { data: recentPlans, isLoading: recentLoading } = useQuery<DayPlan[]>({
    queryKey: ["/api/day-plans", `?employeeId=${user?.id}`],
    enabled: !!user?.id,
  });

  const { data: perf, isLoading: perfLoading } = useQuery<MyPerformance>({
    queryKey: ["/api/my-performance"],
    enabled: !!user?.id,
  });

  const { data: openClockInsData } = useQuery<OpenClockInsResponse>({
    queryKey: ["/api/my-open-clock-ins"],
    enabled: !!user?.id,
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const todayPlan = plans?.[0];
  const otherPlans = (recentPlans || []).filter((p) => p.date !== today).slice(0, 10);
  const openClockIns = openClockInsData?.openClockIns ?? [];

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-my-plan-title">
          Sveiki, {user?.firstName || "Darbuotojau"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {new Date().toLocaleDateString("lt-LT", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {openClockIns.length > 0 && (
        <Card
          className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800"
          data-testid="banner-forgotten-clock-out"
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-2">
                <div>
                  <p className="font-semibold text-amber-900 dark:text-amber-100">
                    Nepažymėjote darbo pabaigos
                  </p>
                  <p className="text-sm text-amber-800 dark:text-amber-200 mt-0.5">
                    {openClockIns.length === 1
                      ? `Pažymėjote darbo pradžią, bet ne pabaigą. Spustelėkite „Baigti darbą“, kad būtų teisingai užfiksuotas dirbtas laikas.`
                      : `Turite ${openClockIns.length} dien(-as), kuriose pažymėta darbo pradžia be pabaigos. Atidarykite kiekvieną planą ir užbaikite dieną.`}
                  </p>
                </div>
                <div className="space-y-1.5">
                  {openClockIns.map((p) => {
                    const startedFmt = new Date(p.workStartedAt).toLocaleString("lt-LT", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    return (
                      <Link key={p.id} href={`/plan/${p.id}`}>
                        <div
                          className="flex items-center justify-between gap-3 bg-white dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2 hover-elevate cursor-pointer"
                          data-testid={`link-open-clock-in-${p.id}`}
                        >
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            <span className="font-medium">
                              {p.isToday
                                ? "Šiandien"
                                : new Date(p.date + "T00:00:00").toLocaleDateString("lt-LT", {
                                    weekday: "short",
                                    day: "numeric",
                                    month: "short",
                                  })}
                            </span>
                            <span className="text-muted-foreground">
                              · pradėta {startedFmt}
                            </span>
                            {!p.isToday && (
                              <Badge
                                variant="outline"
                                className="text-xs border-amber-400 text-amber-800 dark:text-amber-200"
                              >
                                Reikia admin pagalbos
                              </Badge>
                            )}
                          </div>
                          <ArrowRight className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">Šiandienos planas</h2>
        {todayPlan ? (
          <Link href={`/plan/${todayPlan.id}`}>
            <Card className="hover-elevate cursor-pointer" data-testid="card-today-plan">
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                      <ClipboardList className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Dienos planas</p>
                      <p className="text-sm text-muted-foreground">{today}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={todayPlan.status === "closed" ? "secondary" : "default"} className="text-xs">
                      {STATUS_LABELS[todayPlan.status] || todayPlan.status}
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Šiandien plano nėra</p>
              <p className="text-sm text-muted-foreground mt-1">Admin dar nesukūrė jūsų plano šiai dienai.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Mano rezultatai</h2>
        {perfLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : perf && perf.totalClosedPlans > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card data-testid="card-perf-week">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Ši savaitė</span>
                  </div>
                  {perf.weekDays > 0 ? (
                    <>
                      <p className={`text-2xl font-bold ${getScoreColor(perf.weekAvg)}`} data-testid="text-perf-week-avg">
                        {perf.weekAvg}%
                      </p>
                      <Progress value={Math.min(perf.weekAvg, 100)} className={`h-1.5 mt-2 ${getProgressColor(perf.weekAvg)}`} />
                      <p className="text-xs text-muted-foreground mt-1">{perf.weekDays} d. uždarytos</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Dar nėra duomenų</p>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="card-perf-month">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Šis mėnuo</span>
                  </div>
                  {perf.monthDays > 0 ? (
                    <>
                      <p className={`text-2xl font-bold ${getScoreColor(perf.monthAvg)}`} data-testid="text-perf-month-avg">
                        {perf.monthAvg}%
                      </p>
                      <Progress value={Math.min(perf.monthAvg, 100)} className={`h-1.5 mt-2 ${getProgressColor(perf.monthAvg)}`} />
                      <p className="text-xs text-muted-foreground mt-1">{perf.monthDays} d. uždarytos</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Dar nėra duomenų</p>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="card-perf-overall">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Bendras vidurkis</span>
                  </div>
                  <p className={`text-2xl font-bold ${getScoreColor(perf.overallAvg)}`} data-testid="text-perf-overall-avg">
                    {perf.overallAvg}%
                  </p>
                  <Progress value={Math.min(perf.overallAvg, 100)} className={`h-1.5 mt-2 ${getProgressColor(perf.overallAvg)}`} />
                  <p className="text-xs text-muted-foreground mt-1">{perf.totalClosedPlans} d. iš viso</p>
                </CardContent>
              </Card>
            </div>

            {perf.recentDays.length > 0 && (
              <Card data-testid="card-perf-history">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-3">Paskutinės dienos</p>
                  <div className="space-y-1.5">
                    {perf.recentDays.map((day) => (
                      <div key={day.date} className="flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground w-20 shrink-0">
                          {new Date(day.date + "T00:00:00").toLocaleDateString("lt-LT", { month: "short", day: "numeric", weekday: "short" })}
                        </span>
                        <div className="flex-1">
                          <Progress value={Math.min(day.score, 100)} className={`h-2 ${getProgressColor(day.score)}`} />
                        </div>
                        <span className={`text-xs font-medium w-10 text-right ${getScoreColor(day.score)}`}>
                          {day.score}%
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Kol kas nėra uždarytų planų — rezultatai bus rodomi čia.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {perf?.workSchedule === "flex" && perf.workedTime && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Mano dirbtas laikas</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Timer className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Ši savaitė</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-worked-week">
                  {formatMinutes(perf.workedTime.weekMinutes)}
                </p>
                <p className="text-xs text-muted-foreground mt-1" data-testid="text-planned-week">
                  Numatyta: {formatMinutes(perf.workedTime.weekPlannedMinutes ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Timer className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Šis mėnuo</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-worked-month">
                  {formatMinutes(perf.workedTime.monthMinutes)}
                </p>
                <p className="text-xs text-muted-foreground mt-1" data-testid="text-planned-month">
                  Numatyta: {formatMinutes(perf.workedTime.monthPlannedMinutes ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Timer className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Iš viso</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-worked-total">
                  {formatMinutes(perf.workedTime.totalMinutes)}
                </p>
                <p className="text-xs text-muted-foreground mt-1" data-testid="text-planned-total">
                  Numatyta: {formatMinutes(perf.workedTime.totalPlannedMinutes ?? 0)}
                </p>
              </CardContent>
            </Card>
          </div>
          {perf.workedTime.recent.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-3">Paskutinės dienos (faktas / numatyta)</p>
                <div className="space-y-1.5">
                  {perf.workedTime.recent.map((d) => {
                    const planned = d.plannedMinutes ?? 0;
                    const overrun = planned > 0 && d.minutes > planned;
                    const within = planned > 0 && d.minutes > 0 && d.minutes <= planned;
                    return (
                      <div key={d.date} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">
                          {new Date(d.date + "T00:00:00").toLocaleDateString("lt-LT", { month: "short", day: "numeric", weekday: "short" })}
                        </span>
                        <span className={`font-medium ${overrun ? "text-red-600" : within ? "text-green-600" : ""}`} data-testid={`text-worked-day-${d.date}`}>
                          {formatMinutes(d.minutes)} <span className="text-muted-foreground font-normal">/ {formatMinutes(planned)}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {perf?.absences && perf.absences.total > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Nebuvimai</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <UserX className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Ši savaitė</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-absences-week">{perf.absences.week}</p>
                <p className="text-xs text-muted-foreground mt-1">d. praleista</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <UserX className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Šis mėnuo</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-absences-month">{perf.absences.month}</p>
                <p className="text-xs text-muted-foreground mt-1">d. praleista</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <UserX className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Iš viso</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-absences-total">{perf.absences.total}</p>
                <p className="text-xs text-muted-foreground mt-1">d. praleista</p>
              </CardContent>
            </Card>
          </div>
          {perf.absences.recent.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-3">Paskutiniai nebuvimai</p>
                <div className="space-y-1.5">
                  {perf.absences.recent.map((a, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">
                        {new Date(a.date + "T00:00:00").toLocaleDateString("lt-LT", { month: "short", day: "numeric", weekday: "short" })}
                      </span>
                      <Badge variant="outline" className="text-xs">{a.reason}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {otherPlans.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Ankstesni planai</h2>
          <div className="space-y-2">
            {otherPlans.map((p) => (
              <Link key={p.id} href={`/plan/${p.id}`}>
                <Card className="hover-elevate cursor-pointer" data-testid={`card-past-plan-${p.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {new Date(p.date + "T00:00:00").toLocaleDateString("lt-LT", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {STATUS_LABELS[p.status] || p.status}
                        </Badge>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
