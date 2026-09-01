import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, UserX, Plus, Wand2, X, Clock, ArrowRight, Timer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { User } from "@shared/schema";

const ABSENCE_REASONS = [
  "Nėra darbe",
  "Atostogauja",
  "Pavaduoja kolegą",
  "Nedarbingumo lapas",
];

interface UnclosedPlan {
  id: number;
  date: string;
  status: string;
  employeeId: string;
  employeeName: string;
}

interface ForgottenClockOut {
  id: number;
  date: string;
  employeeId: string;
  employeeName: string;
  workStartedAt: string;
}

interface PendingPlansData {
  missing: User[];
  absences: { id: number; employeeId: string; reason: string; employeeName: string }[];
  unclosed: UnclosedPlan[];
  forgottenClockOuts?: ForgottenClockOut[];
  date: string;
}

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("lt-LT", { month: "short", day: "numeric", weekday: "short" });
}

export function PendingPlansBlocker({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null);
  const [absenceReason, setAbsenceReason] = useState("");

  const [location, navigate] = useLocation();
  const isManager = user?.role === "owner" || user?.role === "admin";
  const isOnPlanPage = /^\/plan\/\d+/.test(location);

  const today = new Date().toISOString().split("T")[0];

  const { data: pendingData, isLoading } = useQuery<PendingPlansData>({
    queryKey: ["/api/pending-plans", `?date=${today}`],
    enabled: isManager,
    refetchInterval: 30000,
  });

  const createPlanMutation = useMutation({
    mutationFn: async (data: { date: string; employeeId: string }) => {
      const res = await apiRequest("POST", "/api/day-plans", { ...data, status: "planned" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pending-plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/day-plans"] });
      toast({ title: "Planas sukurtas" });
    },
    onError: (err: Error) => {
      toast({ title: "Klaida", description: err.message, variant: "destructive" });
    },
  });

  const generatePlanMutation = useMutation({
    mutationFn: async (data: { date: string; employeeId: string }) => {
      const res = await apiRequest("POST", "/api/day-plans/generate", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pending-plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/day-plans"] });
      toast({ title: "Planas sugeneruotas" });
    },
    onError: (err: Error) => {
      toast({ title: "Klaida", description: err.message, variant: "destructive" });
    },
  });

  const absenceMutation = useMutation({
    mutationFn: async (data: { employeeId: string; date: string; reason: string }) => {
      const res = await apiRequest("POST", "/api/absences", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pending-plans"] });
      setAbsenceDialogOpen(false);
      setSelectedEmployee(null);
      setAbsenceReason("");
      toast({ title: "Nebuvimas pažymėtas" });
    },
    onError: (err: Error) => {
      toast({ title: "Klaida", description: err.message, variant: "destructive" });
    },
  });

  const deleteAbsenceMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/absences/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pending-plans"] });
      toast({ title: "Nebuvimas pašalintas" });
    },
    onError: (err: Error) => {
      toast({ title: "Klaida", description: err.message, variant: "destructive" });
    },
  });

  const isOwner = user?.role === "owner";

  if (!isManager || isOnPlanPage || isOwner) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="animate-pulse text-muted-foreground text-sm">Tikrinama...</div>
      </div>
    );
  }

  const hasMissing = pendingData && pendingData.missing.length > 0;
  const hasUnclosed = pendingData && pendingData.unclosed && pendingData.unclosed.length > 0;
  const hasForgottenClockOuts =
    pendingData && pendingData.forgottenClockOuts && pendingData.forgottenClockOuts.length > 0;
  const hasIssues = hasMissing || hasUnclosed || hasForgottenClockOuts;

  if (!hasIssues) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col h-full items-center justify-start p-6 overflow-auto">
      <div className="max-w-2xl w-full space-y-6">

        {hasUnclosed && (
          <div>
            <div className="flex items-start gap-3 mb-4">
              <Clock className="h-6 w-6 text-red-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-red-900" data-testid="text-unclosed-plans-title">
                  Neuždaryta diena ({pendingData!.unclosed.length})
                </h2>
                <p className="text-sm text-red-700 mt-1">
                  Šie planai dar neuždaryti. Pažymėkite atliktus darbus ir uždarykite dieną.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {pendingData!.unclosed.map((plan) => (
                <Card
                  key={plan.id}
                  className="border-red-200 hover:bg-red-50/50 cursor-pointer transition-colors"
                  data-testid={`card-unclosed-plan-${plan.id}`}
                  onClick={() => navigate(`/plan/${plan.id}`)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{plan.employeeName}</span>
                        <Badge variant="outline" className="text-xs text-red-700 border-red-300">
                          {formatDateShort(plan.date)}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {plan.status === "planned" ? "Suplanuotas" : plan.status === "in_progress" ? "Vykdomas" : plan.status}
                        </Badge>
                      </div>
                      <ArrowRight className="h-4 w-4 text-red-400" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {hasForgottenClockOuts && (
          <div>
            <div className="flex items-start gap-3 mb-4">
              <Timer className="h-6 w-6 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-amber-900" data-testid="text-forgotten-clock-outs-title">
                  Nepažymėta darbo pabaiga ({pendingData!.forgottenClockOuts!.length})
                </h2>
                <p className="text-sm text-amber-700 mt-1">
                  Šie lankstaus grafiko darbuotojai pažymėjo darbo pradžią, bet ne pabaigą. Atidarykite jų planą ir pažymėkite trūkstamą laiką arba uždarykite dieną.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {pendingData!.forgottenClockOuts!.map((p) => {
                const startedFmt = new Date(p.workStartedAt).toLocaleString("lt-LT", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <Card
                    key={p.id}
                    className="border-amber-200 hover:bg-amber-50/50 cursor-pointer transition-colors"
                    data-testid={`card-forgotten-clock-out-${p.id}`}
                    onClick={() => navigate(`/plan/${p.id}`)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{p.employeeName}</span>
                          <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
                            {formatDateShort(p.date)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            pradėta {startedFmt}
                          </span>
                        </div>
                        <ArrowRight className="h-4 w-4 text-amber-400" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {hasMissing && (
          <div>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-amber-900" data-testid="text-pending-plans-title">
                  Dar liko sukurti planus ({pendingData!.missing.length})
                </h2>
                <p className="text-sm text-amber-700 mt-1">
                  Prieš pradedant darbą, sukurkite dienos planus visiems aktyviems darbuotojams arba pažymėkite priežastį, kodėl plano negalima sukurti.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {pendingData!.missing.map((emp) => (
                <Card key={emp.id} className="border-amber-200" data-testid={`card-missing-plan-${emp.id}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {emp.firstName} {emp.lastName}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {emp.role === "owner" ? "Savininkas" : emp.role === "admin" ? "Admin" : "Darbuotojas"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedEmployee(emp);
                            setAbsenceDialogOpen(true);
                          }}
                          data-testid={`button-mark-absent-${emp.id}`}
                        >
                          <UserX className="h-3.5 w-3.5 mr-1" />
                          Nėra galimybės
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => generatePlanMutation.mutate({ date: today, employeeId: emp.id })}
                          disabled={generatePlanMutation.isPending}
                          data-testid={`button-generate-missing-${emp.id}`}
                        >
                          <Wand2 className="h-3.5 w-3.5 mr-1" />
                          Generuoti
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => createPlanMutation.mutate({ date: today, employeeId: emp.id })}
                          disabled={createPlanMutation.isPending}
                          data-testid={`button-create-missing-${emp.id}`}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Sukurti
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {pendingData!.absences.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-amber-800 mb-2">Pažymėti nebuvimai:</p>
                <div className="space-y-1">
                  {pendingData!.absences.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 text-sm bg-amber-50 rounded px-3 py-1.5" data-testid={`absence-${a.id}`}>
                      <span>
                        <span className="font-medium">{a.employeeName}</span>
                        {" — "}
                        <span className="text-muted-foreground">{a.reason}</span>
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => deleteAbsenceMutation.mutate(a.id)}
                        data-testid={`button-remove-absence-${a.id}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={absenceDialogOpen} onOpenChange={setAbsenceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Pažymėti nebuvimą — {selectedEmployee?.firstName} {selectedEmployee?.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Select value={absenceReason} onValueChange={setAbsenceReason}>
              <SelectTrigger data-testid="select-absence-reason">
                <SelectValue placeholder="Pasirinkite priežastį" />
              </SelectTrigger>
              <SelectContent>
                {ABSENCE_REASONS.map((reason) => (
                  <SelectItem key={reason} value={reason}>
                    {reason}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAbsenceDialogOpen(false);
                setSelectedEmployee(null);
                setAbsenceReason("");
              }}
            >
              Atšaukti
            </Button>
            <Button
              onClick={() => {
                if (selectedEmployee && absenceReason) {
                  absenceMutation.mutate({
                    employeeId: selectedEmployee.id,
                    date: today,
                    reason: absenceReason,
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
