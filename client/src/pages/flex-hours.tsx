import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Clock, Download, Users, AlertTriangle, CalendarDays, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User } from "@shared/schema";

type FlexTask = {
  taskType: string;
  plannedQty: number;
  actualQty: number;
  unit: string | null;
  status: string;
};

type FlexHoursDay = {
  planId: number;
  date: string;
  workStartedAt: string | null;
  workEndedAt: string | null;
  hours: number;
  plannedHours: number;
  deltaHours: number;
  complete: boolean;
  tasks: FlexTask[];
  tasksPlannedQty: number;
  tasksActualQty: number;
  tasksCompletionPct: number;
  tasksDone: boolean;
  planStatus: string;
};

type FlexHoursEmployee = {
  employeeId: string;
  employeeName: string;
  expectedDailyHours: number;
  days: FlexHoursDay[];
  totalHours: number;
  totalPlannedHours: number;
  totalDeltaHours: number;
};

type FlexHoursResponse = {
  startDate: string;
  endDate: string;
  employees: FlexHoursEmployee[];
  grandTotalHours: number;
  grandTotalPlannedHours: number;
  grandTotalDeltaHours: number;
};

const SIGNIFICANT_DELTA_RATIO = 0.15;

function deltaTone(actual: number, planned: number) {
  if (planned <= 0) return "neutral" as const;
  const ratio = (actual - planned) / planned;
  if (ratio > SIGNIFICANT_DELTA_RATIO) return "over" as const;
  if (ratio < -SIGNIFICANT_DELTA_RATIO) return "under" as const;
  return "ok" as const;
}

function fmtDelta(d: number): string {
  const sign = d > 0 ? "+" : d < 0 ? "−" : "±";
  return `${sign}${Math.abs(d).toFixed(2)}`;
}

function deltaClass(tone: "over" | "under" | "ok" | "neutral"): string {
  if (tone === "over") return "text-amber-700 dark:text-amber-400 font-medium";
  if (tone === "under") return "text-red-700 dark:text-red-400 font-medium";
  if (tone === "ok") return "text-green-700 dark:text-green-400";
  return "text-muted-foreground";
}

type DayStatus = {
  label: string;
  className: string;
} | null;

function dayStatusBadge(d: FlexHoursDay): DayStatus {
  if (!d.complete) {
    return { label: "Nepilnas", className: "text-amber-700 border-amber-300" };
  }
  const hasTasks = d.tasksPlannedQty > 0;
  const fast = d.hours < d.plannedHours * (1 - SIGNIFICANT_DELTA_RATIO);
  const slow = d.hours > d.plannedHours * (1 + SIGNIFICANT_DELTA_RATIO);

  if (hasTasks) {
    if (d.tasksDone) {
      if (fast) return { label: "Atlikta greičiau", className: "text-green-700 border-green-300" };
      if (slow) return { label: "Užtruko ilgiau", className: "text-amber-700 border-amber-300" };
      return { label: "Atlikta", className: "text-green-700 border-green-300" };
    }
    if (d.tasksCompletionPct < 80) {
      return { label: "Nepilnai įvykdyta", className: "text-red-700 border-red-300" };
    }
    return { label: "Iš dalies atlikta", className: "text-amber-700 border-amber-300" };
  }

  if (slow) return { label: "Viršija", className: "text-amber-700 border-amber-300" };
  if (fast) return { label: "Per mažai", className: "text-red-700 border-red-300" };
  return null;
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

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

function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function fmtHours(h: number): string {
  return h.toFixed(2);
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("lt-LT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const offsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}

function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("lt-LT", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function FlexHours() {
  const { user } = useAuth();
  const isManager = user?.role === "owner" || user?.role === "admin";
  const defaults = getDefaultDateRange();
  const { toast } = useToast();

  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("daily");
  const [editingDay, setEditingDay] = useState<
    | { planId: number; employeeName: string; date: string; workStartedAt: string | null; workEndedAt: string | null }
    | null
  >(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");

  useEffect(() => {
    if (editingDay) {
      setEditStart(toLocalInputValue(editingDay.workStartedAt));
      setEditEnd(toLocalInputValue(editingDay.workEndedAt));
    }
  }, [editingDay]);

  const updateWorkTimesMutation = useMutation({
    mutationFn: async (vars: { planId: number; workStartedAt: string | null; workEndedAt: string | null }) => {
      const res = await apiRequest("PATCH", `/api/day-plans/${vars.planId}/work-times`, {
        workStartedAt: vars.workStartedAt,
        workEndedAt: vars.workEndedAt,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/flex-hours"] });
      toast({ title: "Darbo laikai atnaujinti" });
      setEditingDay(null);
    },
    onError: (err: any) => {
      const msg = err?.message?.replace(/^\d+:\s*/, "") || "Nepavyko atnaujinti";
      let parsed = msg;
      try {
        const obj = JSON.parse(msg);
        if (obj?.message) parsed = obj.message;
      } catch {}
      toast({ title: "Klaida", description: parsed, variant: "destructive" });
    },
  });

  const handleSaveEdit = () => {
    if (!editingDay) return;
    const startIso = localInputToIso(editStart);
    const endIso = localInputToIso(editEnd);
    if (startIso && endIso && new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      toast({
        title: "Klaida",
        description: "Darbo pabaiga turi būti vėliau už darbo pradžią",
        variant: "destructive",
      });
      return;
    }
    if (!startIso && !endIso) {
      toast({
        title: "Klaida",
        description: "Nurodykite bent vieną laiką",
        variant: "destructive",
      });
      return;
    }
    updateWorkTimesMutation.mutate({
      planId: editingDay.planId,
      workStartedAt: startIso,
      workEndedAt: endIso,
    });
  };

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isManager,
  });

  const flexEmployees = useMemo(
    () => (users || []).filter((u) => u.workSchedule === "flex"),
    [users]
  );

  const queryParams = new URLSearchParams();
  queryParams.set("startDate", startDate);
  queryParams.set("endDate", endDate);
  if (selectedEmployee !== "all") {
    queryParams.set("employeeId", selectedEmployee);
  }

  const { data, isLoading } = useQuery<FlexHoursResponse>({
    queryKey: ["/api/admin/flex-hours", `?${queryParams.toString()}`],
    enabled: isManager,
  });

  const employees = data?.employees || [];

  const handlePreset = (preset: string) => {
    const range = getPresetRange(preset);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const weeklyByEmployee = useMemo(() => {
    return employees.map((emp) => {
      const buckets: Record<string, { hours: number; planned: number }> = {};
      for (const d of emp.days) {
        const key = isoWeekKey(d.date);
        const b = buckets[key] || { hours: 0, planned: 0 };
        b.hours += d.hours;
        b.planned += d.plannedHours;
        buckets[key] = b;
      }
      return {
        ...emp,
        weeks: Object.entries(buckets)
          .map(([week, v]) => ({
            week,
            hours: Math.round(v.hours * 100) / 100,
            plannedHours: Math.round(v.planned * 100) / 100,
            deltaHours: Math.round((v.hours - v.planned) * 100) / 100,
          }))
          .sort((a, b) => a.week.localeCompare(b.week)),
      };
    });
  }, [employees]);

  const monthlyByEmployee = useMemo(() => {
    return employees.map((emp) => {
      const buckets: Record<string, { hours: number; planned: number }> = {};
      for (const d of emp.days) {
        const key = monthKey(d.date);
        const b = buckets[key] || { hours: 0, planned: 0 };
        b.hours += d.hours;
        b.planned += d.plannedHours;
        buckets[key] = b;
      }
      return {
        ...emp,
        months: Object.entries(buckets)
          .map(([month, v]) => ({
            month,
            hours: Math.round(v.hours * 100) / 100,
            plannedHours: Math.round(v.planned * 100) / 100,
            deltaHours: Math.round((v.hours - v.planned) * 100) / 100,
          }))
          .sort((a, b) => a.month.localeCompare(b.month)),
      };
    });
  }, [employees]);

  const incompleteCount = useMemo(() => {
    return employees.reduce(
      (s, e) => s + e.days.filter((d) => !d.complete).length,
      0
    );
  }, [employees]);

  const handleExport = () => {
    if (employees.length === 0) {
      toast({ title: "Nėra duomenų eksportui", variant: "destructive" });
      return;
    }
    const headers = [
      "Darbuotojas",
      "Data",
      "Pradžia",
      "Pabaiga",
      "Faktinės val.",
      "Planuotos val.",
      "Skirtumas",
      "Užduotys",
      "Įvykdyta %",
      "Statusas",
    ];
    const lines = [headers.map(csvEscape).join(",")];
    for (const emp of employees) {
      for (const d of emp.days) {
        const status = dayStatusBadge(d);
        const tasksSummary = d.tasks.length > 0
          ? d.tasks.map(t => `${t.taskType}: ${fmtQty(t.actualQty)}/${fmtQty(t.plannedQty)}${t.unit ? ` ${t.unit}` : ""}`).join("; ")
          : "";
        lines.push(
          [
            csvEscape(emp.employeeName),
            csvEscape(d.date),
            csvEscape(fmtTime(d.workStartedAt)),
            csvEscape(fmtTime(d.workEndedAt)),
            csvEscape(d.complete ? fmtHours(d.hours) : ""),
            csvEscape(fmtHours(d.plannedHours)),
            csvEscape(d.complete ? fmtDelta(d.deltaHours) : ""),
            csvEscape(tasksSummary),
            csvEscape(d.tasksPlannedQty > 0 ? `${d.tasksCompletionPct}%` : ""),
            csvEscape(status?.label || (d.complete ? "Pilnas" : "Nepilnas")),
          ].join(",")
        );
      }
      lines.push(
        [
          csvEscape(`${emp.employeeName} — VISO`),
          "",
          "",
          "",
          csvEscape(fmtHours(emp.totalHours)),
          csvEscape(fmtHours(emp.totalPlannedHours)),
          csvEscape(fmtDelta(emp.totalDeltaHours)),
          "",
          "",
          "",
        ].join(",")
      );
      lines.push("");
    }
    lines.push(
      [
        csvEscape("BENDRA SUMA"),
        "",
        "",
        "",
        csvEscape(fmtHours(data?.grandTotalHours || 0)),
        csvEscape(fmtHours(data?.grandTotalPlannedHours || 0)),
        csvEscape(fmtDelta(data?.grandTotalDeltaHours || 0)),
        "",
        "",
        "",
      ].join(",")
    );
    downloadCsv(`flex-hours-${startDate}-${endDate}.csv`, lines.join("\n"));
  };

  if (!isManager) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Prieiga tik administratoriams.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-flex-hours-title">
            Lankstaus grafiko valandos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Suskaičiuotos darbo valandos pagal žymėtas darbo pradžias ir pabaigas
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleExport}
          data-testid="button-export-csv"
          disabled={employees.length === 0}
        >
          <Download className="h-4 w-4 mr-2" />
          Eksportuoti CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Laikotarpis</Label>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => handlePreset("week")} data-testid="button-preset-week">7d</Button>
                <Button size="sm" variant="ghost" onClick={() => handlePreset("month")} data-testid="button-preset-month">30d</Button>
                <Button size="sm" variant="ghost" onClick={() => handlePreset("quarter")} data-testid="button-preset-quarter">90d</Button>
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
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Darbuotojas</Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="w-[220px]" data-testid="select-flex-employee">
                  <SelectValue placeholder="Visi flex darbuotojai" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Visi flex darbuotojai</SelectItem>
                  {flexEmployees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-1">
              <div>
                <p className="text-sm text-muted-foreground">Faktinė suma</p>
                <p className="text-2xl font-bold mt-1" data-testid="text-grand-total-hours">
                  {fmtHours(data?.grandTotalHours || 0)} val.
                </p>
                <p className="text-xs text-muted-foreground mt-1" data-testid="text-grand-total-planned-hours">
                  Planuota: {fmtHours(data?.grandTotalPlannedHours || 0)} val.
                </p>
              </div>
              <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-1">
              <div>
                <p className="text-sm text-muted-foreground">Skirtumas</p>
                <p
                  className={`text-2xl font-bold mt-1 ${deltaClass(deltaTone(data?.grandTotalHours || 0, data?.grandTotalPlannedHours || 0))}`}
                  data-testid="text-grand-total-delta"
                >
                  {fmtDelta(data?.grandTotalDeltaHours || 0)} val.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  vs planuotos
                </p>
              </div>
              <div className="h-10 w-10 rounded-md bg-chart-3/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-chart-3" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-1">
              <div>
                <p className="text-sm text-muted-foreground">Darbuotojai</p>
                <p className="text-2xl font-bold mt-1" data-testid="text-employee-count">
                  {employees.length}
                </p>
              </div>
              <div className="h-10 w-10 rounded-md bg-chart-2/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-chart-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-1">
              <div>
                <p className="text-sm text-muted-foreground">Nepilni įrašai</p>
                <p className="text-2xl font-bold mt-1" data-testid="text-incomplete-count">
                  <span className={incompleteCount > 0 ? "text-amber-600" : "text-green-600"}>
                    {incompleteCount}
                  </span>
                </p>
              </div>
              <div className="h-10 w-10 rounded-md bg-amber-500/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : employees.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <CalendarDays className="h-10 w-10 mx-auto mb-3" />
            <p>Pasirinktame laikotarpyje nėra flex darbuotojų valandų.</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="daily" data-testid="tab-daily">Dienomis</TabsTrigger>
            <TabsTrigger value="weekly" data-testid="tab-weekly">Savaitėmis</TabsTrigger>
            <TabsTrigger value="monthly" data-testid="tab-monthly">Mėnesiais</TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="space-y-3 mt-4">
            {employees.map((emp) => {
              const totalTone = deltaTone(emp.totalHours, emp.totalPlannedHours);
              return (
                <Card key={emp.employeeId} data-testid={`card-flex-employee-${emp.employeeId}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <CardTitle className="text-base">{emp.employeeName}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Planuota pagal užduotis (normatyvai)
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" data-testid={`badge-total-${emp.employeeId}`}>
                          Faktinė {fmtHours(emp.totalHours)} val.
                        </Badge>
                        <Badge variant="outline" data-testid={`badge-planned-${emp.employeeId}`}>
                          Planuota {fmtHours(emp.totalPlannedHours)} val.
                        </Badge>
                        <Badge
                          variant="outline"
                          className={deltaClass(totalTone)}
                          data-testid={`badge-delta-${emp.employeeId}`}
                        >
                          {fmtDelta(emp.totalDeltaHours)} val.
                        </Badge>
                        <Badge variant="outline">{emp.days.length} d.</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-8 gap-2 text-xs text-muted-foreground border-b pb-1.5 mb-1">
                      <span>Data</span>
                      <span className="hidden sm:block">Pradžia</span>
                      <span className="hidden sm:block">Pabaiga</span>
                      <span>Faktinės</span>
                      <span className="hidden sm:block">Planuotos</span>
                      <span>Skirtumas</span>
                      <span></span>
                      <span></span>
                    </div>
                    <div className="space-y-1">
                      {emp.days.map((d) => {
                        const tone = d.complete ? deltaTone(d.hours, d.plannedHours) : "neutral";
                        const status = dayStatusBadge(d);
                        return (
                          <div
                            key={d.date}
                            className="border-b last:border-0 py-1.5"
                            data-testid={`row-day-${emp.employeeId}-${d.date}`}
                          >
                            <div className="grid grid-cols-2 sm:grid-cols-8 gap-2 text-sm items-center">
                              <span className="text-muted-foreground">{fmtDate(d.date)}</span>
                              <span className="hidden sm:block">{fmtTime(d.workStartedAt)}</span>
                              <span className="hidden sm:block">{fmtTime(d.workEndedAt)}</span>
                              <span className="font-medium" data-testid={`text-hours-${emp.employeeId}-${d.date}`}>
                                {d.complete ? `${fmtHours(d.hours)} val.` : "—"}
                              </span>
                              <span
                                className="hidden sm:block text-muted-foreground"
                                data-testid={`text-planned-${emp.employeeId}-${d.date}`}
                              >
                                {fmtHours(d.plannedHours)} val.
                              </span>
                              <span
                                className={deltaClass(tone)}
                                data-testid={`text-delta-${emp.employeeId}-${d.date}`}
                              >
                                {d.complete ? `${fmtDelta(d.deltaHours)} val.` : "—"}
                              </span>
                              <span>
                                {status ? (
                                  <Badge
                                    variant="outline"
                                    className={`${status.className} text-xs`}
                                    data-testid={`badge-status-${emp.employeeId}-${d.date}`}
                                  >
                                    {status.label}
                                  </Badge>
                                ) : null}
                              </span>
                              <span className="justify-self-end">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2"
                                  onClick={() =>
                                    setEditingDay({
                                      planId: d.planId,
                                      employeeName: emp.employeeName,
                                      date: d.date,
                                      workStartedAt: d.workStartedAt,
                                      workEndedAt: d.workEndedAt,
                                    })
                                  }
                                  data-testid={`button-edit-times-${emp.employeeId}-${d.date}`}
                                >
                                  <Pencil className="h-3.5 w-3.5 mr-1" />
                                  Taisyti
                                </Button>
                              </span>
                            </div>
                            {d.tasks.length > 0 ? (
                              <div className="mt-1 ml-1 pl-2 border-l-2 border-muted text-xs text-muted-foreground space-y-0.5">
                                <div
                                  className="font-medium text-foreground/80"
                                  data-testid={`text-tasks-summary-${emp.employeeId}-${d.date}`}
                                >
                                  Užduotys: {d.tasks.length} · įvykdyta {d.tasksCompletionPct}%
                                  {d.tasksDone ? " · visos atliktos" : ""}
                                </div>
                                {d.tasks.map((t, idx) => {
                                  const done = t.actualQty >= t.plannedQty && t.plannedQty > 0;
                                  const partial = t.actualQty > 0 && t.actualQty < t.plannedQty;
                                  const cls = done
                                    ? "text-green-700 dark:text-green-400"
                                    : partial
                                      ? "text-amber-700 dark:text-amber-400"
                                      : "text-red-700 dark:text-red-400";
                                  return (
                                    <div
                                      key={`${t.taskType}-${idx}`}
                                      className="flex justify-between gap-2"
                                      data-testid={`row-task-${emp.employeeId}-${d.date}-${idx}`}
                                    >
                                      <span className="truncate">{t.taskType}</span>
                                      <span className={cls}>
                                        {fmtQty(t.actualQty)} / {fmtQty(t.plannedQty)}{t.unit ? ` ${t.unit}` : ""}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="mt-1 ml-1 pl-2 border-l-2 border-muted text-xs text-muted-foreground italic">
                                Užduočių planas nepateiktas
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="weekly" className="space-y-3 mt-4">
            {weeklyByEmployee.map((emp) => {
              const totalTone = deltaTone(emp.totalHours, emp.totalPlannedHours);
              return (
                <Card key={emp.employeeId} data-testid={`card-week-${emp.employeeId}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <CardTitle className="text-base">{emp.employeeName}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Planuota pagal užduotis (normatyvai)
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary">Faktinė {fmtHours(emp.totalHours)} val.</Badge>
                        <Badge variant="outline">Planuota {fmtHours(emp.totalPlannedHours)} val.</Badge>
                        <Badge variant="outline" className={deltaClass(totalTone)}>
                          {fmtDelta(emp.totalDeltaHours)} val.
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground border-b pb-1.5 mb-1">
                      <span>Savaitė</span>
                      <span className="text-right">Faktinės</span>
                      <span className="text-right">Planuotos</span>
                      <span className="text-right">Skirtumas</span>
                    </div>
                    <div className="space-y-1">
                      {emp.weeks.map((w) => {
                        const tone = deltaTone(w.hours, w.plannedHours);
                        return (
                          <div
                            key={w.week}
                            className="grid grid-cols-4 gap-2 text-sm py-1.5 border-b last:border-0"
                            data-testid={`row-week-${emp.employeeId}-${w.week}`}
                          >
                            <span className="text-muted-foreground">{w.week}</span>
                            <span className="font-medium text-right">{fmtHours(w.hours)}</span>
                            <span className="text-right text-muted-foreground">{fmtHours(w.plannedHours)}</span>
                            <span
                              className={`text-right ${deltaClass(tone)}`}
                              data-testid={`text-delta-week-${emp.employeeId}-${w.week}`}
                            >
                              {fmtDelta(w.deltaHours)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="monthly" className="space-y-3 mt-4">
            {monthlyByEmployee.map((emp) => {
              const totalTone = deltaTone(emp.totalHours, emp.totalPlannedHours);
              return (
                <Card key={emp.employeeId} data-testid={`card-month-${emp.employeeId}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <CardTitle className="text-base">{emp.employeeName}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Planuota pagal užduotis (normatyvai)
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary">Faktinė {fmtHours(emp.totalHours)} val.</Badge>
                        <Badge variant="outline">Planuota {fmtHours(emp.totalPlannedHours)} val.</Badge>
                        <Badge variant="outline" className={deltaClass(totalTone)}>
                          {fmtDelta(emp.totalDeltaHours)} val.
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground border-b pb-1.5 mb-1">
                      <span>Mėnuo</span>
                      <span className="text-right">Faktinės</span>
                      <span className="text-right">Planuotos</span>
                      <span className="text-right">Skirtumas</span>
                    </div>
                    <div className="space-y-1">
                      {emp.months.map((m) => {
                        const tone = deltaTone(m.hours, m.plannedHours);
                        return (
                          <div
                            key={m.month}
                            className="grid grid-cols-4 gap-2 text-sm py-1.5 border-b last:border-0"
                            data-testid={`row-month-${emp.employeeId}-${m.month}`}
                          >
                            <span className="text-muted-foreground">{m.month}</span>
                            <span className="font-medium text-right">{fmtHours(m.hours)}</span>
                            <span className="text-right text-muted-foreground">{fmtHours(m.plannedHours)}</span>
                            <span
                              className={`text-right ${deltaClass(tone)}`}
                              data-testid={`text-delta-month-${emp.employeeId}-${m.month}`}
                            >
                              {fmtDelta(m.deltaHours)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={!!editingDay} onOpenChange={(open) => !open && setEditingDay(null)}>
        <DialogContent data-testid="dialog-edit-work-times">
          <DialogHeader>
            <DialogTitle>Taisyti darbo laikus</DialogTitle>
            <DialogDescription>
              {editingDay ? `${editingDay.employeeName} — ${fmtDate(editingDay.date)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-work-started" className="text-sm">Darbo pradžia</Label>
              <Input
                id="edit-work-started"
                type="datetime-local"
                value={editStart}
                onChange={(e) => setEditStart(e.target.value)}
                data-testid="input-edit-work-started"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-work-ended" className="text-sm">Darbo pabaiga</Label>
              <Input
                id="edit-work-ended"
                type="datetime-local"
                value={editEnd}
                onChange={(e) => setEditEnd(e.target.value)}
                data-testid="input-edit-work-ended"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Palikite lauką tuščią, jei norite išvalyti laiką. Pakeitimai įrašomi į žurnalą.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingDay(null)}
              data-testid="button-cancel-edit-times"
            >
              Atšaukti
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateWorkTimesMutation.isPending}
              data-testid="button-save-edit-times"
            >
              {updateWorkTimesMutation.isPending ? "Saugoma..." : "Išsaugoti"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
