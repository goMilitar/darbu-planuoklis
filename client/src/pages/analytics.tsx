import { useState, useMemo, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, Target, RefreshCw, Users, CalendarDays, BarChart3, AlertTriangle, Layers, ChevronDown, ChevronUp, UserX,
} from "lucide-react";
import type { User } from "@shared/schema";

const TASK_TYPE_FILTERS = [
  { value: "all", label: "Visi darbai" },
  { value: "Surplus Inbound", label: "Surplus Inbound" },
  { value: "Brand inbound AMZ", label: "Brand inbound AMZ" },
  { value: "Brand Inbound", label: "Brand Inbound" },
  { value: "SHIP FBA", label: "SHIP FBA" },
  { value: "Return processing", label: "Return processing" },
  { value: "Inventorisation", label: "Inventorisation" },
  { value: "Order Processing", label: "Order Processing" },
  { value: "Picking AMZ", label: "Picking AMZ" },
  { value: "Picking", label: "Picking" },
  { value: "Photoshoot", label: "Photoshoot" },
  { value: "Clothing Preparing", label: "Clothing Preparing" },
  { value: "Photo Editing", label: "Photo Editing" },
  { value: "Attributes", label: "Attributes" },
  { value: "Planning", label: "Planning" },
  { value: "Maintain warehouse", label: "Maintain warehouse" },
  { value: "Refill From Pallets", label: "Refill From Pallets" },
  { value: "Thermo-Packaging", label: "Thermo-Packaging" },
  { value: "Labeling", label: "Labeling" },
];

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

function getPresetRange(preset: string) {
  const end = new Date();
  const start = new Date();

  switch (preset) {
    case "week":
      start.setDate(start.getDate() - 7);
      break;
    case "month":
      start.setDate(start.getDate() - 30);
      break;
    case "quarter":
      start.setDate(start.getDate() - 90);
      break;
    default:
      start.setDate(start.getDate() - 30);
  }

  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

export default function Analytics() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const defaults = getDefaultDateRange();

  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [selectedTaskType, setSelectedTaskType] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("overview");

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isOwner,
  });

  const queryParams = new URLSearchParams();
  queryParams.set("startDate", startDate);
  queryParams.set("endDate", endDate);
  if (selectedEmployee !== "all" && isOwner) {
    queryParams.set("employeeId", selectedEmployee);
  }
  if (selectedTaskType !== "all") {
    queryParams.set("taskType", selectedTaskType);
  }

  const { data: analytics, isLoading } = useQuery<any>({
    queryKey: ["/api/analytics", `?${queryParams.toString()}`],
  });

  const employees = users?.filter((u) => u.role === "employee") || [];

  const handlePreset = (preset: string) => {
    const range = getPresetRange(preset);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const summary = analytics?.summary || {};
  const byEmployee = analytics?.byEmployee || [];
  const byDate = analytics?.byDate || [];
  const byTaskType = analytics?.byTaskType || [];
  const absences = analytics?.absences || [];

  const absencesByEmployee = useMemo(() => {
    const map: Record<string, { employeeName: string; dates: { date: string; reason: string }[] }> = {};
    for (const a of absences) {
      if (!map[a.employeeId]) {
        map[a.employeeId] = { employeeName: a.employeeName, dates: [] };
      }
      map[a.employeeId].dates.push({ date: a.date, reason: a.reason });
    }
    return Object.entries(map).map(([id, data]) => ({ employeeId: id, ...data }));
  }, [absences]);

  const absenceCountByEmployee = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of absences) {
      map[a.employeeId] = (map[a.employeeId] || 0) + 1;
    }
    return map;
  }, [absences]);

  const chartData = useMemo(() => {
    return byDate.map((d: any) => ({
      ...d,
      date: new Date(d.date + "T00:00:00").toLocaleDateString("lt-LT", { month: "short", day: "numeric" }),
    }));
  }, [byDate]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-analytics-title">Analitika</h1>
          <p className="text-sm text-muted-foreground mt-1">Našumo ir atlikimo ataskaitos</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Laikotarpis</Label>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => handlePreset("week")} data-testid="button-preset-week">
                  7d
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handlePreset("month")} data-testid="button-preset-month">
                  30d
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handlePreset("quarter")} data-testid="button-preset-quarter">
                  90d
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nuo</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-[160px]"
                data-testid="input-start-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Iki</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-[160px]"
                data-testid="input-end-date"
              />
            </div>
            {isOwner && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Darbuotojas</Label>
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger className="w-[200px]" data-testid="select-analytics-employee">
                    <SelectValue placeholder="Visi darbuotojai" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Visi darbuotojai</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Darbo tipas</Label>
              <Select value={selectedTaskType} onValueChange={setSelectedTaskType}>
                <SelectTrigger className="w-[200px]" data-testid="select-analytics-task-type">
                  <SelectValue placeholder="Visi darbai" />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPE_FILTERS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-1">
              <div>
                <p className="text-sm text-muted-foreground">Atlikimas</p>
                <p className="text-2xl font-bold mt-1" data-testid="text-analytics-completion">
                  {summary.completionRate || 0}%
                </p>
              </div>
              <div className="h-10 w-10 rounded-md bg-chart-2/10 flex items-center justify-center">
                <Target className="h-5 w-5 text-chart-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-1">
              <div>
                <p className="text-sm text-muted-foreground">Suplanuota</p>
                <p className="text-2xl font-bold mt-1">{summary.totalPlanned || 0}</p>
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
                <p className="text-sm text-muted-foreground">Atlikta</p>
                <p className="text-2xl font-bold mt-1">{summary.totalActual || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-md bg-chart-3/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-chart-3" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-1">
              <div>
                <p className="text-sm text-muted-foreground">Perkelta</p>
                <p className="text-2xl font-bold mt-1">{summary.totalCarryoverOut || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-md bg-chart-4/10 flex items-center justify-center">
                <RefreshCw className="h-5 w-5 text-chart-4" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-1">
              <div>
                <p className="text-sm text-muted-foreground">Neįvykdyta norma</p>
                <p className="text-2xl font-bold mt-1" data-testid="text-days-under-norm">
                  <span className={summary.daysUnderNorm > 0 ? "text-destructive" : "text-green-600"}>
                    {summary.daysUnderNorm || 0}
                  </span>
                  <span className="text-sm font-normal text-muted-foreground"> / {summary.totalDays || 0} d.</span>
                </p>
              </div>
              <div className="h-10 w-10 rounded-md bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Apžvalga</TabsTrigger>
          <TabsTrigger value="employees" data-testid="tab-employees">Darbuotojai</TabsTrigger>
          <TabsTrigger value="tasks" data-testid="tab-tasks">Pagal darbus</TabsTrigger>
          <TabsTrigger value="daily" data-testid="tab-daily">Dieninė</TabsTrigger>
          <TabsTrigger value="absences" data-testid="tab-absences">
            Nebuvimai
            {absences.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">{absences.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Atlikimas per laikotarpį</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                        color: "hsl(var(--foreground))",
                      }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="totalPlanned"
                      name="Suplanuota"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary) / 0.1)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="totalActual"
                      name="Atlikta"
                      stroke="hsl(var(--chart-2))"
                      fill="hsl(var(--chart-2) / 0.1)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <BarChart3 className="h-10 w-10 mx-auto mb-3" />
                    <p>Nėra duomenų pasirinktam laikotarpiui</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Perkėlimų tendencija</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                        color: "hsl(var(--foreground))",
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="totalCarryoverIn"
                      name="Gauta"
                      fill="hsl(var(--chart-4))"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="totalCarryoverOut"
                      name="Perkelta"
                      fill="hsl(var(--chart-5))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  Nėra duomenų
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employees" className="space-y-3 mt-4">
          {byEmployee.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Nėra darbuotojų duomenų</p>
              </CardContent>
            </Card>
          ) : (
            byEmployee
              .sort((a: any, b: any) => b.completionRate - a.completionRate)
              .map((emp: any) => (
                <Card key={emp.employeeId} data-testid={`card-analytics-employee-${emp.employeeId}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <span className="font-medium">{emp.employeeName || "Nežinomas"}</span>
                        <span className="text-sm text-muted-foreground ml-2">
                          {emp.planCount} planų
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {emp.completionRate >= 90 ? (
                          <TrendingUp className="h-4 w-4 text-chart-2" />
                        ) : emp.completionRate < 50 ? (
                          <TrendingDown className="h-4 w-4 text-destructive" />
                        ) : null}
                        <span className="text-xl font-bold">{emp.completionRate}%</span>
                      </div>
                    </div>
                    <Progress value={emp.completionRate} className="h-2" />
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Suplanuota</p>
                        <p className="font-medium">{emp.totalPlanned}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Atlikta</p>
                        <p className="font-medium">{emp.totalActual}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Gauta perkėlimų</p>
                        <p className="font-medium text-chart-4">{emp.totalCarryoverIn}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Perkelta kitiems</p>
                        <p className="font-medium text-chart-5">{emp.totalCarryoverOut}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Neįvykdyta norma</p>
                        <p className={`font-medium ${emp.daysUnderNorm > 0 ? "text-destructive" : "text-green-600"}`}>
                          {emp.daysUnderNorm} / {emp.totalDays} d.
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Nebuvimai</p>
                        <p className={`font-medium ${(absenceCountByEmployee[emp.employeeId] || 0) > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                          {absenceCountByEmployee[emp.employeeId] || 0} d.
                        </p>
                      </div>
                    </div>
                    {emp.workSchedule === "flex" && emp.flexStats && (() => {
                      const fs = emp.flexStats;
                      const fmt = (m: number) => {
                        const h = Math.floor(m / 60); const r = m % 60;
                        if (h === 0) return `${r} min.`;
                        if (r === 0) return `${h} val.`;
                        return `${h}val ${r}min`;
                      };
                      return (
                        <div className="border-t pt-3 mt-2 space-y-2" data-testid={`section-flex-stats-${emp.employeeId}`}>
                          <p className="text-xs font-medium text-muted-foreground">Lankstaus grafiko laikas</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                            <div>
                              <p className="text-muted-foreground text-xs">Faktiškai dirbta</p>
                              <p className="font-medium" data-testid={`text-flex-worked-${emp.employeeId}`}>{fmt(fs.workedMinutes)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Numatyta</p>
                              <p className="font-medium" data-testid={`text-flex-planned-${emp.employeeId}`}>{fmt(fs.plannedMinutes)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Viršyta</p>
                              <p className={`font-medium ${fs.overrunMinutes > 0 ? "text-destructive" : "text-green-600"}`} data-testid={`text-flex-overrun-${emp.employeeId}`}>
                                {fs.overrunMinutes > 0 ? `+${fmt(fs.overrunMinutes)}` : "0"}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Per laiką / Vėluota</p>
                              <p className="font-medium" data-testid={`text-flex-days-${emp.employeeId}`}>
                                <span className="text-green-600">{fs.daysWithinTime}</span>
                                <span className="text-muted-foreground"> / </span>
                                <span className="text-destructive">{fs.daysOverTime}</span>
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              ))
          )}
        </TabsContent>

        <TabsContent value="tasks" className="space-y-3 mt-4">
          {byTaskType.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Layers className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Nėra duomenų pagal darbo tipus</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Darbų paskirstymas</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={Math.max(200, byTaskType.length * 50)}>
                    <BarChart data={byTaskType} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))" }} className="text-xs" />
                      <YAxis
                        type="category"
                        dataKey="taskType"
                        width={150}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "6px",
                          color: "hsl(var(--foreground))",
                        }}
                      />
                      <Legend />
                      <Bar dataKey="totalPlanned" name="Suplanuota" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="totalActual" name="Atlikta" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="space-y-2">
                {byTaskType.map((task: any) => (
                  <Card key={task.taskType} data-testid={`card-task-type-${task.taskType}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4 mb-2">
                        <div className="flex items-center gap-2">
                          <Layers className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{task.taskType}</span>
                          <Badge variant="outline" className="text-xs">{task.lineCount} eilučių</Badge>
                        </div>
                        <span className={`text-lg font-bold ${task.completionRate >= 90 ? "text-green-600" : task.completionRate >= 70 ? "text-yellow-600" : "text-destructive"}`}>
                          {task.completionRate}%
                        </span>
                      </div>
                      <Progress
                        value={task.completionRate}
                        className={`h-1.5 ${task.completionRate >= 90 ? "[&>div]:bg-green-500" : task.completionRate >= 70 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-red-500"}`}
                      />
                      <div className="flex gap-6 mt-2 text-xs text-muted-foreground">
                        <span>Suplanuota: <strong className="text-foreground">{task.totalPlanned}</strong></span>
                        <span>Atlikta: <strong className="text-foreground">{task.totalActual}</strong></span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="daily" className="space-y-3 mt-4">
          {byDate.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Nėra dieninių duomenų</p>
              </CardContent>
            </Card>
          ) : (
            byDate
              .sort((a: any, b: any) => b.date.localeCompare(a.date))
              .map((day: any) => {
                const dayAbsences = absences.filter((a: any) => a.date === day.date);
                return (
                  <Card key={day.date} data-testid={`card-analytics-date-${day.date}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <span className="font-medium">
                            {new Date(day.date + "T00:00:00").toLocaleDateString("lt-LT", {
                              weekday: "long",
                              month: "long",
                              day: "numeric",
                            })}
                          </span>
                          <span className="text-sm text-muted-foreground ml-2">
                            {day.employees} darbuotojų
                          </span>
                        </div>
                        <span className="text-xl font-bold">{day.completionRate}%</span>
                      </div>
                      <Progress value={day.completionRate} className="h-2" />
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-muted-foreground text-xs">Suplanuota</p>
                          <p className="font-medium">{day.totalPlanned}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Atlikta</p>
                          <p className="font-medium">{day.totalActual}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Gauta</p>
                          <p className="font-medium text-chart-4">{day.totalCarryoverIn}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Liko</p>
                          <p className="font-medium text-chart-5">{day.totalCarryoverOut}</p>
                        </div>
                      </div>
                      {dayAbsences.length > 0 && (
                        <div className="border-t pt-2 mt-2">
                          <p className="text-xs text-muted-foreground mb-1">Nebuvimai:</p>
                          <div className="flex flex-wrap gap-2">
                            {dayAbsences.map((a: any) => (
                              <Badge key={a.id} variant="outline" className="text-xs text-amber-700 border-amber-300">
                                <UserX className="h-3 w-3 mr-1" />
                                {a.employeeName} — {a.reason}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
          )}
        </TabsContent>

        <TabsContent value="absences" className="space-y-3 mt-4">
          {absencesByEmployee.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <UserX className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Nebuvimų per pasirinktą laikotarpį nėra</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3 mb-4">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Iš viso nebuvimų</p>
                    <p className="text-2xl font-bold mt-1" data-testid="text-total-absences">{absences.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Darbuotojų su nebuvimais</p>
                    <p className="text-2xl font-bold mt-1">{absencesByEmployee.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Dažniausia priežastis</p>
                    <p className="text-lg font-bold mt-1">
                      {absences.length > 0
                        ? (() => {
                            const counts: Record<string, number> = {};
                            for (const a of absences) counts[a.reason] = (counts[a.reason] || 0) + 1;
                            return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
                          })()
                        : "—"}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {absencesByEmployee
                .sort((a, b) => b.dates.length - a.dates.length)
                .map((emp) => (
                  <Card key={emp.employeeId} data-testid={`card-absence-employee-${emp.employeeId}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <UserX className="h-4 w-4 text-amber-600" />
                          <span className="font-medium">{emp.employeeName}</span>
                        </div>
                        <Badge variant="secondary">{emp.dates.length} d.</Badge>
                      </div>
                      <div className="space-y-1">
                        {emp.dates
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .map((d, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                              <span className="text-muted-foreground">
                                {new Date(d.date + "T00:00:00").toLocaleDateString("lt-LT", {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                              <Badge variant="outline" className="text-xs">{d.reason}</Badge>
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
