import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";
import {
  CalendarDays, Plus, ChevronLeft, ChevronRight, ArrowRight, Wand2, Clock, UserX, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { DayPlan, User } from "@shared/schema";

const STATUS_LABELS: Record<string, string> = {
  planned: "Suplanuotas",
  in_progress: "Vykdomas",
  done: "Atliktas",
  closed: "Uždarytas",
};

const STATUS_VARIANT: Record<string, string> = {
  planned: "secondary",
  in_progress: "default",
  done: "default",
  closed: "secondary",
};

const ABSENCE_REASONS = ["Nėra darbe", "Atostogauja", "Pavaduoja kolegą", "Nedarbingumo lapas"];

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("lt-LT", { month: "short", day: "numeric", weekday: "short" });
}

function formatDateLong(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("lt-LT", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
}

function getWeekDates(referenceDate: Date): string[] {
  const start = new Date(referenceDate);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

function isManagerRole(role?: string) {
  return role === "owner" || role === "admin";
}

export default function DayPlans() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [weekRef, setWeekRef] = useState(new Date());
  const [createOpen, setCreateOpen] = useState(false);
  const [newPlanEmployee, setNewPlanEmployee] = useState("");
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [absenceEmployee, setAbsenceEmployee] = useState<User | null>(null);
  const [absenceReason, setAbsenceReason] = useState("");
  const [absencePlanId, setAbsencePlanId] = useState<number | null>(null);

  const weekDates = getWeekDates(weekRef);
  const isManager = isManagerRole(user?.role);

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: dayPlans, isLoading } = useQuery<(DayPlan & { employee: User })[]>({
    queryKey: ["/api/day-plans", `?date=${selectedDate}`],
  });

  const { data: absences } = useQuery<{ id: number; employeeId: string; date: string; reason: string }[]>({
    queryKey: ["/api/absences", selectedDate],
    queryFn: async () => {
      const res = await fetch(`/api/absences?date=${selectedDate}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { date: string; employeeId: string }) => {
      const res = await apiRequest("POST", "/api/day-plans", { ...data, status: "planned" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/day-plans"] });
      setCreateOpen(false);
      setNewPlanEmployee("");
      toast({ title: "Planas sukurtas" });
    },
    onError: (err: Error) => {
      toast({ title: "Klaida", description: err.message, variant: "destructive" });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { date: string; employeeId: string }) => {
      const res = await apiRequest("POST", "/api/day-plans/generate", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/day-plans"] });
      toast({ title: "Planas sugeneruotas", description: "Vakarykštės eilutės nukopijuotos" });
    },
    onError: (err: Error) => {
      toast({ title: "Klaida", description: err.message, variant: "destructive" });
    },
  });

  const absenceMutation = useMutation({
    mutationFn: async (data: { employeeId: string; date: string; reason: string; deletePlanId?: number | null }) => {
      if (data.deletePlanId) {
        await apiRequest("DELETE", `/api/day-plans/${data.deletePlanId}`);
      }
      const res = await apiRequest("POST", "/api/absences", {
        employeeId: data.employeeId,
        date: data.date,
        reason: data.reason,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/absences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/day-plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pending-plans"] });
      setAbsenceDialogOpen(false);
      setAbsenceEmployee(null);
      setAbsenceReason("");
      setAbsencePlanId(null);
      toast({ title: "Nebuvimas pažymėtas" });
    },
    onError: (err: Error) => {
      toast({ title: "Klaida", description: err.message, variant: "destructive" });
    },
  });

  const removeAbsenceMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/absences/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/absences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pending-plans"] });
      toast({ title: "Nebuvimas pašalintas" });
    },
    onError: (err: Error) => {
      toast({ title: "Klaida", description: err.message, variant: "destructive" });
    },
  });

  const employees = users || [];
  const activeEmployees = employees.filter(e => e.isActive);

  const employeesWithPlans = new Set(dayPlans?.map(p => p.employeeId) || []);
  const absentEmployeeIds = new Set(absences?.map(a => a.employeeId) || []);
  const employeesWithoutPlans = activeEmployees.filter(
    e => !employeesWithPlans.has(e.id) && !absentEmployeeIds.has(e.id) && !isManagerRole(e.role)
  );

  const prevWeek = () => {
    const d = new Date(weekRef);
    d.setDate(d.getDate() - 7);
    setWeekRef(d);
  };

  const nextWeek = () => {
    const d = new Date(weekRef);
    d.setDate(d.getDate() + 7);
    setWeekRef(d);
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-day-plans-title">Dienos planai</h1>
          <p className="text-sm text-muted-foreground mt-1">{formatDateLong(selectedDate)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-plan">
                <Plus className="mr-2 h-4 w-4" />
                Naujas planas
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Sukurti naują planą</DialogTitle>
                <DialogDescription>Pasirinkite darbuotoją ir sukurkite planą pasirinktai dienai.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={selectedDate}
                    readOnly
                    data-testid="input-plan-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Darbuotojas</Label>
                  <Select value={newPlanEmployee} onValueChange={setNewPlanEmployee}>
                    <SelectTrigger data-testid="select-plan-employee">
                      <SelectValue placeholder="Pasirinkite darbuotoją" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.firstName} {emp.lastName}
                        </SelectItem>
                      ))}
                      {employees.length === 0 && (
                        <SelectItem value="none" disabled>
                          Nėra darbuotojų
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!newPlanEmployee) return;
                    generateMutation.mutate({ date: selectedDate, employeeId: newPlanEmployee });
                    setCreateOpen(false);
                  }}
                  disabled={!newPlanEmployee || generateMutation.isPending}
                  data-testid="button-generate-plan"
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  Generuoti iš vakar
                </Button>
                <Button
                  onClick={() => {
                    if (!newPlanEmployee) return;
                    createMutation.mutate({ date: selectedDate, employeeId: newPlanEmployee });
                  }}
                  disabled={!newPlanEmployee || createMutation.isPending}
                  data-testid="button-submit-plan"
                >
                  Sukurti tuščią
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={prevWeek} data-testid="button-prev-week">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex gap-1 flex-1 overflow-x-auto">
          {weekDates.map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDate(d)}
              className={`flex-1 min-w-[60px] px-2 py-2 rounded-md text-center text-sm transition-colors ${
                d === selectedDate
                  ? "bg-primary text-primary-foreground"
                  : d === today
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground"
              }`}
              data-testid={`button-date-${d}`}
            >
              <div className="font-medium">
                {new Date(d + "T00:00:00").toLocaleDateString("lt-LT", { weekday: "short" })}
              </div>
              <div className="text-xs mt-0.5">
                {new Date(d + "T00:00:00").getDate()}
              </div>
            </button>
          ))}
        </div>
        <Button size="icon" variant="ghost" onClick={nextWeek} data-testid="button-next-week">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isManager && !isLoading && (employeesWithoutPlans.length > 0 || (absences && absences.length > 0)) && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            {employeesWithoutPlans.length > 0 && (
              <div className="mb-3">
                <p className="text-sm font-medium text-amber-800 mb-2">
                  Dar liko sukurti planus ({employeesWithoutPlans.length}):
                </p>
                <div className="flex flex-wrap gap-2">
                  {employeesWithoutPlans.map((emp) => (
                    <div key={emp.id} className="flex items-center gap-1.5 bg-white rounded-lg px-3 py-1.5 border text-sm" data-testid={`missing-employee-${emp.id}`}>
                      <span>{emp.firstName} {emp.lastName}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-amber-700 hover:text-amber-900"
                        onClick={() => {
                          setAbsenceEmployee(emp);
                          setAbsencePlanId(null);
                          setAbsenceReason("");
                          setAbsenceDialogOpen(true);
                        }}
                        data-testid={`button-mark-absent-${emp.id}`}
                      >
                        <UserX className="h-3.5 w-3.5 mr-1" />
                        Nėra
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          createMutation.mutate({ date: selectedDate, employeeId: emp.id });
                        }}
                        data-testid={`button-quick-create-${emp.id}`}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Sukurti
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          generateMutation.mutate({ date: selectedDate, employeeId: emp.id });
                        }}
                        data-testid={`button-quick-generate-${emp.id}`}
                      >
                        <Wand2 className="h-3.5 w-3.5 mr-1" />
                        Generuoti
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {absences && absences.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-800 mb-2">Pažymėti nebuvimai:</p>
                <div className="flex flex-wrap gap-2">
                  {absences.map((a) => {
                    const emp = employees.find(e => e.id === a.employeeId);
                    return (
                      <div key={a.id} className="flex items-center gap-1.5 bg-amber-100 rounded-lg px-3 py-1.5 text-sm" data-testid={`absence-${a.id}`}>
                        <UserX className="h-3.5 w-3.5 text-amber-700" />
                        <span>{emp ? `${emp.firstName} ${emp.lastName}` : a.employeeId}</span>
                        <Badge variant="outline" className="text-xs">{a.reason}</Badge>
                        <button
                          className="ml-1 text-amber-600 hover:text-red-600"
                          onClick={() => removeAbsenceMutation.mutate(a.id)}
                          data-testid={`button-remove-absence-${a.id}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : !dayPlans || dayPlans.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-2">Šiai dienai planų nėra</p>
            <p className="text-sm text-muted-foreground">
              Sukurkite naują planą arba sugeneruokite iš vakarykščio.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {dayPlans.map((plan) => (
            <Card key={plan.id} className="hover-elevate h-full" data-testid={`card-day-plan-${plan.id}`}>
              <CardContent className="p-4 space-y-3">
                <Link href={`/plan/${plan.id}`} className="block cursor-pointer">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">
                      {plan.employee?.firstName} {plan.employee?.lastName}
                    </span>
                    <Badge variant={STATUS_VARIANT[plan.status] as any} className="text-xs">
                      {STATUS_LABELS[plan.status] || plan.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formatDateShort(plan.date)}</span>
                  </div>
                </Link>
                {isManager && plan.status !== "closed" && (
                  <div className="flex items-center justify-between pt-1 border-t">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-amber-700 hover:text-amber-900"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAbsenceEmployee(plan.employee);
                        setAbsencePlanId(plan.id);
                        setAbsenceReason("");
                        setAbsenceDialogOpen(true);
                      }}
                      data-testid={`button-plan-absent-${plan.id}`}
                    >
                      <UserX className="h-3.5 w-3.5 mr-1" />
                      Nėra darbuotojo
                    </Button>
                    <Link href={`/plan/${plan.id}`}>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </div>
                )}
                {(plan.status === "closed" || !isManager) && (
                  <div className="flex items-center justify-end">
                    <Link href={`/plan/${plan.id}`}>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={absenceDialogOpen} onOpenChange={setAbsenceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pažymėti nebuvimą</DialogTitle>
            <DialogDescription>
              {absenceEmployee?.firstName} {absenceEmployee?.lastName} — {formatDateLong(selectedDate)}
              {absencePlanId && (
                <span className="block mt-1 text-amber-600">Esamas planas bus ištrintas.</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Priežastis</Label>
              <Select value={absenceReason} onValueChange={setAbsenceReason}>
                <SelectTrigger data-testid="select-absence-reason">
                  <SelectValue placeholder="Pasirinkite priežastį..." />
                </SelectTrigger>
                <SelectContent>
                  {ABSENCE_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (absenceEmployee && absenceReason) {
                  absenceMutation.mutate({
                    employeeId: absenceEmployee.id,
                    date: selectedDate,
                    reason: absenceReason,
                    deletePlanId: absencePlanId,
                  });
                }
              }}
              disabled={!absenceReason || absenceMutation.isPending}
              data-testid="button-confirm-absence"
            >
              Patvirtinti
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
