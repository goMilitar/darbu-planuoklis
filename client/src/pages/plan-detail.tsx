import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useRoute, useLocation } from "wouter";
import { TaskCombobox } from "@/components/task-combobox";
import { getBenchmark, calculateDayPerformance, calculateDayLoad, type DayPerformance } from "@shared/benchmarks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Plus, Minus, Lock, RefreshCw, Trash2, CheckCircle2, AlertTriangle,
  Package, GripVertical, Clock, ShieldCheck, Play, Square, Timer, Pencil, Undo2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { DayPlan, PlanLine, User } from "@shared/schema";

const STATUS_LABELS: Record<string, string> = {
  planned: "Suplanuotas",
  in_progress: "Vykdomas",
  done: "Atliktas",
  closed: "Uždarytas",
};

const LINE_STATUS_LABELS: Record<string, string> = {
  open: "Atvira",
  partial: "Dalinai",
  done: "Atlikta",
  skipped: "Praleista",
  blocked: "Blokuota",
};

const LINE_STATUS_COLORS: Record<string, string> = {
  open: "secondary",
  partial: "default",
  done: "default",
  skipped: "secondary",
  blocked: "destructive",
};

function getCompletionColor(pct: number): { border: string; progress: string; bg: string; text: string } {
  if (pct >= 100) return { border: "border-green-500", progress: "[&>div]:bg-green-500", bg: "bg-green-50 dark:bg-green-950/20", text: "text-green-600" };
  if (pct >= 80) return { border: "border-yellow-500", progress: "[&>div]:bg-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950/20", text: "text-yellow-600" };
  if (pct >= 70) return { border: "border-orange-500", progress: "[&>div]:bg-orange-500", bg: "bg-orange-50 dark:bg-orange-950/20", text: "text-orange-600" };
  return { border: "border-red-500", progress: "[&>div]:bg-red-500", bg: "bg-red-50 dark:bg-red-950/20", text: "text-red-600" };
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("lt-LT", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

type PlanData = DayPlan & { lines: PlanLine[]; employee: User };

export default function PlanDetail() {
  const [, params] = useRoute("/plan/:id");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const planId = Number(params?.id);
  const isManager = user?.role === "owner" || user?.role === "admin";

  const [addLineOpen, setAddLineOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [closeCustomText, setCloseCustomText] = useState("");
  const [editTimesOpen, setEditTimesOpen] = useState(false);
  const [editStartLocal, setEditStartLocal] = useState("");
  const [editEndLocal, setEditEndLocal] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [newLine, setNewLine] = useState({
    taskType: "",
    itemCode: "",
    description: "",
    plannedQty: 0,
    unit: "vnt",
  });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const { data: plan, isLoading } = useQuery<PlanData>({
    queryKey: ["/api/day-plans", planId],
    enabled: !!planId,
  });

  const updateLineMutation = useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<PlanLine>) => {
      const res = await apiRequest("PATCH", `/api/plan-lines/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/day-plans", planId] });
    },
    onError: (err: Error) => {
      toast({ title: "Klaida", description: err.message, variant: "destructive" });
    },
  });

  const addLineMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/plan-lines", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/day-plans", planId] });
      setAddLineOpen(false);
      setNewLine({ taskType: "", itemCode: "", description: "", plannedQty: 0, unit: "vnt" });
      toast({ title: "Eilutė pridėta" });
    },
    onError: (err: Error) => {
      const msg = err.message || "";
      if (msg.startsWith("404") || /Plan not found/i.test(msg)) {
        toast({
          title: "Planas neegzistuoja",
          description: "Šis planas buvo ištrintas arba dar nesukurtas. Grįžtame į pradžią.",
          variant: "destructive",
        });
        setAddLineOpen(false);
        queryClient.invalidateQueries({ queryKey: ["/api/day-plans"] });
        queryClient.invalidateQueries({ queryKey: ["/api/day-plans", planId] });
        navigate("/");
        return;
      }
      toast({ title: "Klaida", description: msg, variant: "destructive" });
    },
  });

  const deleteLineMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/plan-lines/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/day-plans", planId] });
      toast({ title: "Eilutė ištrinta" });
    },
  });

  const closePlanMutation = useMutation({
    mutationFn: async (closeComment?: string) => {
      const res = await apiRequest("POST", `/api/day-plans/${planId}/close`, { closeComment });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/day-plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-performance"] });
      const fmt = (m: number) => {
        const h = Math.floor(m / 60); const r = m % 60;
        if (h === 0) return `${r} min.`;
        if (r === 0) return `${h} val.`;
        return `${h} val. ${r} min.`;
      };
      if (data && typeof data.plannedMinutes === "number" && typeof data.actualMinutes === "number") {
        if (data.withinPlannedTime) {
          toast({
            title: "Dienos planas sėkmingai įvykdytas per numatytą laiką",
            description: `Numatyta: ${fmt(data.plannedMinutes)} • Užtrukote: ${fmt(data.actualMinutes)}`,
          });
        } else if (data.overrunMinutes > 0) {
          toast({
            title: "Darbas atliktas ilgiau nei numatyta",
            description: `Buvo suplanuota ${fmt(data.plannedMinutes)}, užtrukote ${fmt(data.actualMinutes)} (+${fmt(data.overrunMinutes)})`,
            variant: "destructive",
          });
        } else {
          toast({ title: "Planas uždarytas", description: "Neatlikti darbai perkelti į kitą dieną" });
        }
      } else {
        toast({ title: "Planas uždarytas", description: "Neatlikti darbai perkelti į kitą dieną" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Klaida", description: err.message, variant: "destructive" });
    },
  });

  const clockInMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/day-plans/${planId}/clock-in`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/day-plans", planId] });
      queryClient.invalidateQueries({ queryKey: ["/api/day-plans"] });
      toast({ title: "Darbo pradžia užfiksuota" });
    },
    onError: (err: Error) => {
      toast({ title: "Klaida", description: err.message, variant: "destructive" });
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/day-plans/${planId}/clock-out`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/day-plans", planId] });
      queryClient.invalidateQueries({ queryKey: ["/api/day-plans"] });
      toast({ title: "Darbo pabaiga užfiksuota" });
    },
    onError: (err: Error) => {
      toast({ title: "Klaida", description: err.message, variant: "destructive" });
    },
  });

  const resetClockInMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/day-plans/${planId}/reset-clock-in`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/day-plans", planId] });
      queryClient.invalidateQueries({ queryKey: ["/api/day-plans"] });
      toast({ title: "Darbo pradžia atšaukta" });
    },
    onError: (err: Error) => {
      toast({ title: "Klaida", description: err.message, variant: "destructive" });
    },
  });

  const editWorkTimesMutation = useMutation({
    mutationFn: async (payload: { workStartedAt: string | null; workEndedAt: string | null }) => {
      const res = await apiRequest("PATCH", `/api/day-plans/${planId}/work-times`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/day-plans", planId] });
      queryClient.invalidateQueries({ queryKey: ["/api/day-plans"] });
      toast({ title: "Darbo laikas atnaujintas" });
    },
    onError: (err: Error) => {
      toast({ title: "Klaida", description: err.message, variant: "destructive" });
    },
  });

  const handleQtyChange = (line: PlanLine, newQty: number) => {
    const qty = Math.max(0, Math.round(newQty));
    updateLineMutation.mutate({ id: line.id, actualQty: qty });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Planas nerastas</p>
        <Button variant="ghost" onClick={() => navigate("/")} className="mt-4">
          Grįžti
        </Button>
      </div>
    );
  }

  const isClosed = plan.status === "closed";
  const totalPlanned = plan.lines.reduce((s, l) => s + l.plannedQty, 0);
  const totalActual = plan.lines.reduce((s, l) => s + Math.min(l.actualQty, l.plannedQty), 0);
  const completionPct = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;
  const carryoverLines = plan.lines.filter((l) => l.isCarryover);
  const regularLines = plan.lines.filter((l) => !l.isCarryover);

  const isEmployeeAdmin = plan.employee?.role === "owner" || plan.employee?.role === "admin";
  const perfOptions = isEmployeeAdmin ? { skipDiversityDiscount: true } : undefined;

  const perf = calculateDayPerformance(plan.lines.map(l => ({
    taskType: l.taskType,
    actualQty: l.actualQty,
    plannedQty: l.plannedQty,
    status: l.status,
  })), perfOptions);
  const hasBenchmarkLines = perf.lines.length > 0;

  const activePlanLines = plan.lines.filter(l => l.status !== "blocked" && l.status !== "skipped");
  const unverifiedCount = activePlanLines.filter(l => !l.verifiedByAdmin).length;

  const dayLoad = calculateDayLoad(plan.lines.map(l => ({
    taskType: l.taskType,
    plannedQty: l.plannedQty,
    status: l.status,
  })), perfOptions);
  const hasLoadLines = dayLoad.totalFraction > 0;

  const todayDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vilnius",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const isMyPlan = plan.employeeId === user?.id;
  const isFlexEmployee = isMyPlan && user?.workSchedule === "flex";
  const isFlexPlan = plan.employee?.workSchedule === "flex";
  const isToday = plan.date === todayDateStr;
  const workStartedAt = plan.workStartedAt ? new Date(plan.workStartedAt) : null;
  const workEndedAt = plan.workEndedAt ? new Date(plan.workEndedAt) : null;
  const workedMinutes = workStartedAt && workEndedAt
    ? Math.max(0, Math.round((workEndedAt.getTime() - workStartedAt.getTime()) / 60000))
    : 0;
  const workedHours = Math.floor(workedMinutes / 60);
  const workedMins = workedMinutes % 60;
  const formatTime = (d: Date) => d.toLocaleTimeString("lt-LT", { hour: "2-digit", minute: "2-digit" });

  const RESET_WINDOW_MS = 5 * 60 * 1000;
  const canResetClockIn =
    isFlexEmployee &&
    !isClosed &&
    !!workStartedAt &&
    !workEndedAt &&
    now - workStartedAt.getTime() <= RESET_WINDOW_MS;

  const toLocalInputValue = (d: Date | null): string => {
    if (!d) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openEditTimes = () => {
    setEditStartLocal(toLocalInputValue(workStartedAt));
    setEditEndLocal(toLocalInputValue(workEndedAt));
    setEditTimesOpen(true);
  };

  const submitEditTimes = () => {
    const startIso = editStartLocal ? new Date(editStartLocal).toISOString() : null;
    const endIso = editEndLocal ? new Date(editEndLocal).toISOString() : null;
    if (endIso && !startIso) {
      toast({ title: "Klaida", description: "Negalima nustatyti pabaigos be pradžios", variant: "destructive" });
      return;
    }
    if (startIso && endIso && new Date(endIso).getTime() < new Date(startIso).getTime()) {
      toast({ title: "Klaida", description: "Pabaiga negali būti anksčiau už pradžią", variant: "destructive" });
      return;
    }
    editWorkTimesMutation.mutate(
      { workStartedAt: startIso, workEndedAt: endIso },
      { onSuccess: () => setEditTimesOpen(false) },
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button size="icon" variant="ghost" onClick={() => navigate(isManager ? "/day-plans" : "/")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-plan-title">
              {plan.employee?.firstName} {plan.employee?.lastName}
            </h1>
            <p className="text-sm text-muted-foreground">{formatDate(plan.date)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={plan.status === "closed" ? "secondary" : "default"} className="text-xs">
            {STATUS_LABELS[plan.status] || plan.status}
          </Badge>
          {!isClosed && isFlexEmployee && isToday && (
            <>
              {!plan.workStartedAt && (
                <Button
                  size="sm"
                  onClick={() => clockInMutation.mutate()}
                  disabled={clockInMutation.isPending}
                  data-testid="button-clock-in"
                >
                  <Play className="mr-1 h-3.5 w-3.5" />
                  Pradėti darbą
                </Button>
              )}
              {plan.workStartedAt && !plan.workEndedAt && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => clockOutMutation.mutate()}
                  disabled={clockOutMutation.isPending}
                  data-testid="button-clock-out"
                >
                  <Square className="mr-1 h-3.5 w-3.5" />
                  Baigti darbą
                </Button>
              )}
              {plan.workStartedAt && plan.workEndedAt && (
                <Dialog open={closeDialogOpen} onOpenChange={(open) => {
                  setCloseDialogOpen(open);
                  if (!open) { setCloseReason(""); setCloseCustomText(""); }
                }}>
                  <DialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={closePlanMutation.isPending}
                      data-testid="button-self-close-plan"
                    >
                      <Lock className="mr-1 h-3.5 w-3.5" />
                      Uždaryti dieną
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Uždaryti dienos planą?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                      Neatlikti darbai bus automatiškai perkelti į kitą dieną. Šis veiksmas negrįžtamas.
                    </p>
                    {completionPct < 100 && (
                      <div className="space-y-3 py-2">
                        <Label>Priežastis, kodėl ne visi darbai atlikti *</Label>
                        <Select value={closeReason} onValueChange={(v) => { setCloseReason(v); if (v !== "Kita") setCloseCustomText(""); }}>
                          <SelectTrigger data-testid="select-self-close-reason">
                            <SelectValue placeholder="Pasirinkite priežastį..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Trūkumas prekių">Trūkumas prekių</SelectItem>
                            <SelectItem value="Sistemos problema">Sistemos problema</SelectItem>
                            <SelectItem value="Vietos problema">Vietos problema</SelectItem>
                            <SelectItem value="Fizinis nuovargis">Fizinis nuovargis</SelectItem>
                            <SelectItem value="Lėta pradžia">Lėta pradžia</SelectItem>
                            <SelectItem value="Kita">Kita</SelectItem>
                          </SelectContent>
                        </Select>
                        {closeReason === "Kita" && (
                          <div className="space-y-2">
                            <Label>Įrašykite priežastį *</Label>
                            <Textarea
                              value={closeCustomText}
                              onChange={(e) => setCloseCustomText(e.target.value)}
                              placeholder="Aprašykite priežastį..."
                              data-testid="input-self-close-custom"
                            />
                          </div>
                        )}
                      </div>
                    )}
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>Atšaukti</Button>
                      <Button
                        variant="destructive"
                        disabled={
                          closePlanMutation.isPending ||
                          (completionPct < 100 && !closeReason) ||
                          (closeReason === "Kita" && !closeCustomText.trim())
                        }
                        onClick={() => {
                          const needsComment = completionPct < 100;
                          const comment = !needsComment
                            ? undefined
                            : closeReason === "Kita"
                              ? closeCustomText.trim()
                              : closeReason;
                          closePlanMutation.mutate(comment, {
                            onSuccess: () => setCloseDialogOpen(false),
                          });
                        }}
                        data-testid="button-confirm-self-close"
                      >
                        Uždaryti
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </>
          )}
          {!isClosed && isFlexEmployee && !isToday && (
            <span className="text-xs text-muted-foreground" data-testid="text-flex-not-today">
              Šio plano uždaryti negalima — admin uždarys.
            </span>
          )}
          {!isClosed && isManager && (
            <>
              <Dialog open={addLineOpen} onOpenChange={setAddLineOpen}>
                <DialogTrigger asChild>
                  <Button variant="secondary" size="sm" data-testid="button-add-line">
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Pridėti
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Pridėti eilutę</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Užduoties tipas</Label>
                        <TaskCombobox
                          value={newLine.taskType}
                          onChange={(v) => {
                            const next = { ...newLine, taskType: v };
                            if (v.startsWith("SHIP FBA")) {
                              next.unit = "dėž.";
                            } else if (v === "Maintain warehouse") {
                              next.unit = "min";
                            }
                            setNewLine(next);
                          }}
                          data-testid="input-task-type"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Prekės kodas {newLine.taskType.startsWith("Surplus Inbound") && <span className="text-red-500">*</span>}</Label>
                        <Input
                          value={newLine.itemCode}
                          onChange={(e) => setNewLine({ ...newLine, itemCode: e.target.value })}
                          placeholder="pvz. SKU-001"
                          data-testid="input-item-code"
                        />
                        {newLine.taskType.startsWith("Surplus Inbound") && (
                          <p className="text-xs text-muted-foreground">SKU or Supplier Code</p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Aprašymas</Label>
                      <Textarea
                        value={newLine.description}
                        onChange={(e) => setNewLine({ ...newLine, description: e.target.value })}
                        placeholder="Papildomas aprašymas..."
                        data-testid="input-description"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Planuojamas kiekis</Label>
                        <Input
                          type="number"
                          min={0}
                          value={newLine.plannedQty === 0 ? "" : newLine.plannedQty}
                          onChange={(e) => {
                            const v = e.target.value;
                            setNewLine({ ...newLine, plannedQty: v === "" ? 0 : Number(v) });
                          }}
                          placeholder="0"
                          data-testid="input-planned-qty"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Vienetas</Label>
                        <Select value={newLine.unit} onValueChange={(v) => setNewLine({ ...newLine, unit: v })}>
                          <SelectTrigger data-testid="select-unit">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vnt">vnt</SelectItem>
                            <SelectItem value="min">min</SelectItem>
                            <SelectItem value="kg">kg</SelectItem>
                            <SelectItem value="m">m</SelectItem>
                            <SelectItem value="dėž.">dėž.</SelectItem>
                            <SelectItem value="pal.">pal.</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() => {
                        if (!newLine.taskType) return;
                        addLineMutation.mutate({
                          dayPlanId: plan.id,
                          taskType: newLine.taskType,
                          itemCode: newLine.itemCode || null,
                          description: newLine.description || null,
                          plannedQty: newLine.plannedQty,
                          actualQty: 0,
                          unit: newLine.unit,
                          status: "open",
                          sortOrder: plan.lines.length,
                          isCarryover: false,
                          carriedQty: 0,
                          blockReason: null,
                          carryoverParentLineId: null,
                        });
                      }}
                      disabled={!newLine.taskType || addLineMutation.isPending || (newLine.taskType.startsWith("Surplus Inbound") && !newLine.itemCode.trim())}
                      data-testid="button-submit-line"
                    >
                      Pridėti
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={closeDialogOpen} onOpenChange={(open) => {
                setCloseDialogOpen(open);
                if (!open) { setCloseReason(""); setCloseCustomText(""); }
              }}>
                <DialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={closePlanMutation.isPending || (!isFlexPlan && hasLoadLines && dayLoad.loadPct < 100) || unverifiedCount > 0} data-testid="button-close-plan">
                    <Lock className="mr-1 h-3.5 w-3.5" />
                    Uždaryti dieną
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Uždaryti dienos planą?</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    Neatlikti darbai bus automatiškai perkelti į kitą dieną. Šis veiksmas negrįžtamas.
                  </p>
                  {completionPct < 100 && (
                    <div className="space-y-3 py-2">
                      <Label>Priežastis, kodėl ne visi darbai atlikti *</Label>
                      <Select value={closeReason} onValueChange={(v) => { setCloseReason(v); if (v !== "Kita") setCloseCustomText(""); }}>
                        <SelectTrigger data-testid="select-close-reason">
                          <SelectValue placeholder="Pasirinkite priežastį..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Trūkumas prekių">Trūkumas prekių</SelectItem>
                          <SelectItem value="Sistemos problema">Sistemos problema</SelectItem>
                          <SelectItem value="Vietos problema">Vietos problema</SelectItem>
                          <SelectItem value="Fizinis nuovargis">Fizinis nuovargis</SelectItem>
                          <SelectItem value="Lėta pradžia">Lėta pradžia</SelectItem>
                          <SelectItem value="Kita">Kita</SelectItem>
                        </SelectContent>
                      </Select>
                      {closeReason === "Kita" && (
                        <div className="space-y-2">
                          <Label>Įrašykite priežastį *</Label>
                          <Textarea
                            value={closeCustomText}
                            onChange={(e) => setCloseCustomText(e.target.value)}
                            placeholder="Aprašykite priežastį..."
                            data-testid="input-close-custom"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>Atšaukti</Button>
                    <Button
                      variant="destructive"
                      disabled={
                        closePlanMutation.isPending ||
                        (completionPct < 100 && !closeReason) ||
                        (closeReason === "Kita" && !closeCustomText.trim())
                      }
                      onClick={() => {
                        const needsComment = completionPct < 100;
                        const comment = !needsComment
                          ? undefined
                          : closeReason === "Kita"
                            ? closeCustomText.trim()
                            : closeReason;
                        closePlanMutation.mutate(comment, {
                          onSuccess: () => setCloseDialogOpen(false),
                        });
                      }}
                      data-testid="button-confirm-close"
                    >
                      Uždaryti
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      {(isFlexPlan || isFlexEmployee) && (workStartedAt || workEndedAt || (isManager && isFlexPlan)) && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Darbo laikas</span>
              </div>
              <div className="flex items-center gap-2">
                {canResetClockIn && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resetClockInMutation.mutate()}
                    disabled={resetClockInMutation.isPending}
                    data-testid="button-reset-clock-in"
                  >
                    <Undo2 className="mr-1 h-3.5 w-3.5" />
                    Atšaukti pradžią
                  </Button>
                )}
                {isManager && isFlexPlan && !isClosed && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={openEditTimes}
                    data-testid="button-edit-work-times"
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Redaguoti
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Pradžia</p>
                <p className="font-medium" data-testid="text-work-started">
                  {workStartedAt ? formatTime(workStartedAt) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pabaiga</p>
                <p className="font-medium" data-testid="text-work-ended">
                  {workEndedAt ? formatTime(workEndedAt) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dirbta</p>
                <p className="font-medium" data-testid="text-work-duration">
                  {workStartedAt && workEndedAt
                    ? `${workedHours} val. ${workedMins} min.`
                    : workStartedAt
                      ? "Vykdoma…"
                      : "—"}
                </p>
              </div>
            </div>
            {canResetClockIn && (
              <p className="text-xs text-muted-foreground mt-2" data-testid="text-reset-window-hint">
                Per 5 minutes nuo pradžios galite atšaukti, jei paspaudėte per klaidą.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {isManager && isFlexPlan && (
        <Dialog open={editTimesOpen} onOpenChange={setEditTimesOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Redaguoti darbo laiką</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Pakeitimai bus įrašyti į įvykių žurnalą. Palikite lauką tuščią, kad išvalytumėte reikšmę.
              </p>
              <div className="space-y-2">
                <Label htmlFor="edit-work-start">Darbo pradžia</Label>
                <Input
                  id="edit-work-start"
                  type="datetime-local"
                  value={editStartLocal}
                  onChange={(e) => setEditStartLocal(e.target.value)}
                  data-testid="input-edit-work-start"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-work-end">Darbo pabaiga</Label>
                <Input
                  id="edit-work-end"
                  type="datetime-local"
                  value={editEndLocal}
                  onChange={(e) => setEditEndLocal(e.target.value)}
                  data-testid="input-edit-work-end"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditTimesOpen(false)}>Atšaukti</Button>
              <Button
                onClick={submitEditTimes}
                disabled={editWorkTimesMutation.isPending}
                data-testid="button-save-work-times"
              >
                Išsaugoti
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isManager && hasLoadLines && !isFlexPlan && (
        <Card className={`${dayLoad.loadPct > 100 ? "border-red-500/50 bg-red-50/30 dark:bg-red-950/10" : dayLoad.loadPct > 85 ? "border-yellow-500/50 bg-yellow-50/30 dark:bg-yellow-950/10" : "border-green-500/50 bg-green-50/30 dark:bg-green-950/10"}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Dienos apkrova</span>
              </div>
              <span className={`text-lg font-bold ${dayLoad.loadPct > 100 ? "text-red-600" : dayLoad.loadPct > 85 ? "text-yellow-600" : "text-green-600"}`} data-testid="text-day-load">
                {dayLoad.loadPct}%
              </span>
            </div>
            <Progress
              value={Math.min(dayLoad.loadPct, 100)}
              className={`h-2.5 ${dayLoad.loadPct > 100 ? "[&>div]:bg-red-500" : dayLoad.loadPct > 85 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-green-500"}`}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-muted-foreground" data-testid="text-day-load-hours">
                {dayLoad.plannedHours}h / {dayLoad.maxHours}.0h
              </span>
              {dayLoad.loadPct > 100 && (
                <span className="flex items-center gap-1 text-xs font-medium text-red-600" data-testid="text-load-warning">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Viršyta dienos norma!
                </span>
              )}
            </div>
            {dayLoad.diversityDiscount > 0 && (
              <p className="text-xs text-muted-foreground mt-2" data-testid="text-diversity-discount">
                Norma sumažinta {Math.round(dayLoad.diversityDiscount * 100)}% ({dayLoad.distinctCategories} skirtingos kategorijos)
              </p>
            )}
            {!isClosed && dayLoad.loadPct < 100 && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t text-sm text-amber-700" data-testid="text-load-insufficient">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Dienos apkrova nepilna — pridėkite užduočių, kad būtų bent 100%. Kol apkrova nepilna, dienos uždaryti negalima.</span>
              </div>
            )}
            {!isClosed && dayLoad.loadPct >= 100 && unverifiedCount > 0 && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t text-sm text-amber-700" data-testid="text-unverified-warning">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>Liko patvirtinti {unverifiedCount} eilutė(-ės). Patvirtinkite visas eilutes prieš uždarymą.</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isManager && isFlexPlan && !isClosed && unverifiedCount > 0 && (
        <Card className="border-amber-500/50 bg-amber-50/30 dark:bg-amber-950/10">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-amber-700" data-testid="text-flex-unverified-warning">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>Liko patvirtinti {unverifiedCount} eilutė(-ės). Patvirtinkite visas eilutes prieš uždarymą.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {isFlexPlan && hasLoadLines && (() => {
        const plannedMin = Math.round(dayLoad.plannedHours * 60);
        const actualMin = workStartedAt && workEndedAt
          ? Math.max(0, Math.round((workEndedAt.getTime() - workStartedAt.getTime()) / 60000))
          : 0;
        const overrun = workEndedAt ? Math.max(0, actualMin - plannedMin) : 0;
        const within = workEndedAt && actualMin > 0 && actualMin <= plannedMin;
        const fmtMin = (m: number) => {
          const h = Math.floor(m / 60); const r = m % 60;
          if (h === 0) return `${r} min.`;
          if (r === 0) return `${h} val.`;
          return `${h} val. ${r} min.`;
        };
        return (
          <Card className={overrun > 0 ? "border-red-500/50 bg-red-50/30 dark:bg-red-950/10" : within ? "border-green-500/50 bg-green-50/30 dark:bg-green-950/10" : "border-primary/30 bg-primary/5"}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Numatyta darbui laiko</span>
                </div>
                <span className="text-lg font-bold" data-testid="text-flex-planned-hours">
                  {fmtMin(plannedMin)}
                </span>
              </div>
              {workEndedAt && (
                <div className="mt-2 pt-2 border-t flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Faktiškai užtrukote</span>
                  <span className={`font-medium ${overrun > 0 ? "text-red-600" : within ? "text-green-600" : ""}`} data-testid="text-flex-actual-hours">
                    {fmtMin(actualMin)}{overrun > 0 ? ` (+${fmtMin(overrun)})` : ""}
                  </span>
                </div>
              )}
              {!isClosed && workEndedAt && overrun > 0 && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Darbas trunka ilgiau nei numatyta.</span>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      <Card className={totalPlanned > 0 && totalActual > 0 ? `${getCompletionColor(completionPct).border} ${getCompletionColor(completionPct).bg}` : ""}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 mb-3">
            <span className="text-sm text-muted-foreground">Bendras atlikimas</span>
            <span className={`text-lg font-bold ${totalPlanned > 0 && totalActual > 0 ? getCompletionColor(completionPct).text : ""}`} data-testid="text-plan-completion">
              {completionPct}%
            </span>
          </div>
          <Progress value={completionPct} className={`h-2 ${totalPlanned > 0 && totalActual > 0 ? getCompletionColor(completionPct).progress : ""}`} />
          <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
            <span>Suplanuota: <strong className="text-foreground">{totalPlanned}</strong></span>
            <span>Atlikta: <strong className="text-foreground">{totalActual}</strong></span>
            {carryoverLines.length > 0 && (
              <span className="flex items-center gap-1">
                <RefreshCw className="h-3.5 w-3.5 text-chart-4" />
                Perkelta: <strong className="text-foreground">{carryoverLines.length}</strong>
              </span>
            )}
          </div>
          {plan.closeComment && (
            <div className="mt-3 pt-3 border-t text-sm">
              <span className="text-muted-foreground">Priežastis: </span>
              <span className="font-medium" data-testid="text-close-comment">{plan.closeComment}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {hasBenchmarkLines && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4 mb-3">
              <span className="text-sm text-muted-foreground">Dienos normos įvykdymas</span>
              <span className={`text-lg font-bold ${perf.performancePct >= 100 ? "text-green-600" : perf.performancePct >= 80 ? "text-yellow-600" : perf.performancePct >= 60 ? "text-orange-600" : "text-red-600"}`} data-testid="text-performance-score">
                {perf.performancePct}%
              </span>
            </div>
            <Progress
              value={Math.min(perf.performancePct, 100)}
              className={`h-2 ${perf.performancePct >= 100 ? "[&>div]:bg-green-500" : perf.performancePct >= 80 ? "[&>div]:bg-yellow-500" : perf.performancePct >= 60 ? "[&>div]:bg-orange-500" : "[&>div]:bg-red-500"}`}
            />
            {isManager && (
              <div className="mt-3 space-y-1.5">
                {perf.lines.map((pl, i) => (
                  <div key={`${pl.subType}-${pl.category}-${i}`} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{pl.category} <span className="opacity-60">({pl.subType.replace("Surplus Inbound ", "")})</span></span>
                    <span>
                      <strong className="text-foreground">{pl.actualQty}</strong>
                      <span className="text-muted-foreground"> / {perf.diversityDiscount > 0 ? Math.round(pl.benchmark.minQty * (1 - perf.diversityDiscount)) : pl.benchmark.minQty}-{perf.diversityDiscount > 0 ? Math.round(pl.benchmark.maxQty * (1 - perf.diversityDiscount)) : pl.benchmark.maxQty}</span>
                      <span className={`ml-2 font-medium ${pl.fractionOfNorm >= 1 ? "text-green-600" : pl.fractionOfNorm >= 0.8 ? "text-yellow-600" : "text-red-600"}`}>
                        {Math.round(pl.fractionOfNorm * 100)}%
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {isManager && perf.diversityDiscount > 0 && (
              <p className="text-xs text-muted-foreground mt-2 pt-2 border-t" data-testid="text-perf-diversity">
                Norma sumažinta {Math.round(perf.diversityDiscount * 100)}% ({perf.distinctCategories} skirtingos kategorijos)
              </p>
            )}
            {isClosed && plan.performanceScore != null && plan.performanceScore !== perf.performancePct && (
              <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                Galutinis rezultatas uždarymo metu: <strong>{plan.performanceScore}%</strong>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {carryoverLines.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-chart-4 flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Perkelta iš vakar ({carryoverLines.length})
          </h2>
          {carryoverLines.map((line) => (
            <PlanLineCard
              key={line.id}
              line={line}
              isClosed={isClosed}
              isManager={isManager}
              canEditQty={isManager || plan.employeeId === user?.id}
              onQtyChange={handleQtyChange}
              onStatusChange={(id, status, blockReason) => updateLineMutation.mutate({ id, status, ...(blockReason ? { blockReason } : {}) })}
              onDelete={(id) => deleteLineMutation.mutate(id)}
              onVerify={(id, verified) => updateLineMutation.mutate({ id, verifiedByAdmin: verified })}
            />
          ))}
        </div>
      )}

      <div className="space-y-2">
        {carryoverLines.length > 0 && (
          <h2 className="text-sm font-semibold text-muted-foreground">
            Šiandienos planas ({regularLines.length})
          </h2>
        )}
        {regularLines.length === 0 && carryoverLines.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Eilučių nėra</p>
              {!isClosed && (
                <p className="text-sm text-muted-foreground mt-1">
                  Pridėkite užduočių paspaudę "Pridėti" mygtuką viršuje.
                </p>
              )}
            </CardContent>
          </Card>
        )}
        {regularLines.map((line) => (
          <PlanLineCard
            key={line.id}
            line={line}
            isClosed={isClosed}
            isManager={isManager}
            canEditQty={isManager || plan.employeeId === user?.id}
            onQtyChange={handleQtyChange}
            onStatusChange={(id, status, blockReason) => updateLineMutation.mutate({ id, status, ...(blockReason ? { blockReason } : {}) })}
            onDelete={(id) => deleteLineMutation.mutate(id)}
            onVerify={(id, verified) => updateLineMutation.mutate({ id, verifiedByAdmin: verified })}
          />
        ))}
      </div>
    </div>
  );
}

function PlanLineCard({
  line,
  isClosed,
  isManager,
  canEditQty,
  onQtyChange,
  onStatusChange,
  onDelete,
  onVerify,
}: {
  line: PlanLine;
  isClosed: boolean;
  isManager: boolean;
  canEditQty: boolean;
  onQtyChange: (line: PlanLine, newQty: number) => void;
  onStatusChange: (id: number, status: string, blockReason?: string) => void;
  onDelete: (id: number) => void;
  onVerify: (id: number, verified: boolean) => void;
}) {
  const [editValue, setEditValue] = useState(String(line.actualQty));
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockReasonText, setBlockReasonText] = useState("");
  useEffect(() => {
    setEditValue(String(line.actualQty));
  }, [line.actualQty]);
  const effectiveDone = Math.min(line.actualQty, line.plannedQty);
  const pct = line.plannedQty > 0 ? Math.round((effectiveDone / line.plannedQty) * 100) : 0;
  const undone = Math.max(line.plannedQty - effectiveDone, 0);
  const showColor = line.plannedQty > 0 && line.actualQty > 0;
  const colors = showColor ? getCompletionColor(pct) : null;
  const benchmark = getBenchmark(line.taskType);

  return (
    <Card
      className={`${line.isCarryover ? "border-chart-4/30" : ""} ${colors ? `${colors.border} ${colors.bg}` : ""}`}
      data-testid={`card-line-${line.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-sm">{line.taskType}</span>
              {line.itemCode && (
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {line.itemCode}
                </span>
              )}
              {line.isCarryover && (
                <Badge variant="secondary" className="text-xs">
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Iš vakar
                </Badge>
              )}
              <Badge variant={LINE_STATUS_COLORS[line.status] as any} className="text-xs">
                {LINE_STATUS_LABELS[line.status] || line.status}
              </Badge>
            </div>
            {line.description && (
              <p className="text-xs text-muted-foreground">{line.description}</p>
            )}
            {line.blockReason && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {line.blockReason}
              </p>
            )}
          </div>

          {isManager && !isClosed && (
            <Button size="icon" variant="ghost" onClick={() => onDelete(line.id)} data-testid={`button-delete-line-${line.id}`}>
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            Planuota: <strong className="text-foreground">{line.plannedQty}</strong> {line.unit}
            {line.taskType === "Maintain warehouse" && (
              <span className="text-xs ml-1">({(line.plannedQty / 60).toFixed(1)} val.)</span>
            )}
            {isManager && benchmark && (
              <span className="text-xs ml-2">(norma: {benchmark.minQty}-{benchmark.maxQty})</span>
            )}
            {line.isCarryover && line.carriedQty ? (
              <span className="text-chart-4 ml-1">(perkelta {line.carriedQty})</span>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5">
            {!isClosed && canEditQty && (
              <Button
                size="icon"
                variant="secondary"
                onClick={() => onQtyChange(line, line.actualQty - 1)}
                disabled={line.actualQty <= 0}
                data-testid={`button-minus-${line.id}`}
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
            )}
            {!isClosed && canEditQty ? (
              <input
                type="number"
                min="0"
                className="w-20 text-center text-lg font-bold border rounded-md px-2 py-1 bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => {
                  const parsed = parseInt(editValue, 10);
                  if (!isNaN(parsed) && parsed >= 0) {
                    onQtyChange(line, parsed);
                  } else {
                    setEditValue(String(line.actualQty));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                data-testid={`input-actual-${line.id}`}
              />
            ) : (
              <span className="text-lg font-bold min-w-[3rem] text-center" data-testid={`text-actual-${line.id}`}>
                {line.actualQty}
              </span>
            )}
            {!isClosed && canEditQty && (
              <Button
                size="icon"
                variant="secondary"
                onClick={() => onQtyChange(line, line.actualQty + 1)}
                data-testid={`button-plus-${line.id}`}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="mt-2">
          <Progress value={pct} className={`h-1.5 ${colors ? colors.progress : ""}`} />
          <div className="flex items-center justify-between gap-2 mt-1 text-xs text-muted-foreground">
            <span className={colors ? colors.text : ""}>
              {pct}% atlikta
              {line.taskType === "Maintain warehouse" && effectiveDone > 0 && (
                <span className="ml-1">({(effectiveDone / 60).toFixed(1)} val.)</span>
              )}
            </span>
            {undone > 0 && (
              <span className="text-chart-4">
                Liko: {undone}
                {line.taskType === "Maintain warehouse" && (
                  <span className="ml-1">({(undone / 60).toFixed(1)} val.)</span>
                )}
              </span>
            )}
          </div>
        </div>

        {!isClosed && isManager && line.status !== "blocked" && line.status !== "skipped" && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Button
              size="sm"
              variant={line.verifiedByAdmin ? "default" : "outline"}
              className={`text-xs ${line.verifiedByAdmin ? "bg-green-600 hover:bg-green-700 text-white" : "border-dashed"}`}
              onClick={() => onVerify(line.id, !line.verifiedByAdmin)}
              data-testid={`button-verify-${line.id}`}
            >
              <ShieldCheck className="h-3.5 w-3.5 mr-1" />
              {line.verifiedByAdmin ? "Patvirtinta ✓" : "Patvirtinti"}
            </Button>
            <div className="h-4 w-px bg-border" />
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => onStatusChange(line.id, "skipped")}
              data-testid={`button-skip-${line.id}`}
            >
              Praleisti
            </Button>
            <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  data-testid={`button-block-${line.id}`}
                >
                  Blokuoti
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Blokavimo priežastis</DialogTitle>
                </DialogHeader>
                <Textarea
                  placeholder="Įveskite priežastį, kodėl užduotis blokuojama..."
                  value={blockReasonText}
                  onChange={(e) => setBlockReasonText(e.target.value)}
                  data-testid={`input-block-reason-${line.id}`}
                />
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setBlockDialogOpen(false);
                      setBlockReasonText("");
                    }}
                  >
                    Atšaukti
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={!blockReasonText.trim()}
                    onClick={() => {
                      onStatusChange(line.id, "blocked", blockReasonText.trim());
                      setBlockDialogOpen(false);
                      setBlockReasonText("");
                    }}
                    data-testid={`button-confirm-block-${line.id}`}
                  >
                    Blokuoti
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
