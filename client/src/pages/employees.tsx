import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Switch } from "@/components/ui/switch";
import { Users, Shield, User as UserIcon, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/schema";

function ExpectedHoursInput({
  userId,
  value,
  disabled,
  onSave,
}: {
  userId: string;
  value: number;
  disabled?: boolean;
  onSave: (hours: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24) {
      setDraft(String(value));
      return;
    }
    if (Math.abs(parsed - value) < 0.001) return;
    onSave(parsed);
  };

  return (
    <Input
      type="number"
      step="0.25"
      min="0"
      max="24"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      disabled={disabled}
      className="w-[80px] text-right"
      data-testid={`input-expected-hours-${userId}`}
    />
  );
}

export default function Employees() {
  const { user: currentUser } = useAuth();
  const isManager = currentUser?.role === "owner" || currentUser?.role === "admin";
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ firstName: "", lastName: "", email: "", password: "" });

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const res = await apiRequest("PATCH", `/api/users/${id}/role`, { role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Rolė atnaujinta" });
    },
    onError: (err: Error) => {
      toast({ title: "Klaida", description: err.message, variant: "destructive" });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async ({ id, workSchedule }: { id: string; workSchedule: string }) => {
      const res = await apiRequest("PATCH", `/api/users/${id}/work-schedule`, { workSchedule });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Darbo grafikas atnaujintas" });
    },
    onError: (err: Error) => {
      toast({ title: "Klaida", description: err.message, variant: "destructive" });
    },
  });

  const expectedHoursMutation = useMutation({
    mutationFn: async ({ id, expectedDailyHours }: { id: string; expectedDailyHours: number }) => {
      const res = await apiRequest("PATCH", `/api/users/${id}/expected-daily-hours`, { expectedDailyHours });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/flex-hours"] });
      toast({ title: "Planuojamos valandos atnaujintos" });
    },
    onError: (err: Error) => {
      toast({ title: "Klaida", description: err.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setAddOpen(false);
      setNewEmployee({ firstName: "", lastName: "", email: "", password: "" });
      toast({ title: "Darbuotojas pridėtas" });
    },
    onError: (err: Error) => {
      toast({ title: "Klaida", description: err.message, variant: "destructive" });
    },
  });

  const activeMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/users/${id}/active`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pending-plans"] });
      toast({ title: "Statusas atnaujintas" });
    },
    onError: (err: Error) => {
      toast({ title: "Klaida", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Darbuotojas ištrintas" });
    },
    onError: (err: Error) => {
      toast({ title: "Klaida", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-employees-title">Darbuotojai</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Valdykite darbuotojų roles ir prieigą
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-employee">
              <Plus className="mr-2 h-4 w-4" />
              Pridėti darbuotoją
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Naujas darbuotojas</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Vardas *</Label>
                  <Input
                    value={newEmployee.firstName}
                    onChange={(e) => setNewEmployee({ ...newEmployee, firstName: e.target.value })}
                    placeholder="Jonas"
                    data-testid="input-employee-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pavardė</Label>
                  <Input
                    value={newEmployee.lastName}
                    onChange={(e) => setNewEmployee({ ...newEmployee, lastName: e.target.value })}
                    placeholder="Jonaitis"
                    data-testid="input-employee-last-name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>El. paštas *</Label>
                <Input
                  type="email"
                  value={newEmployee.email}
                  onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                  placeholder="jonas@example.com"
                  data-testid="input-employee-email"
                />
              </div>
              <div className="space-y-2">
                <Label>Slaptažodis *</Label>
                <Input
                  type="password"
                  value={newEmployee.password}
                  onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })}
                  placeholder="Bent 6 simboliai"
                  data-testid="input-employee-password"
                />
                <p className="text-xs text-muted-foreground">Darbuotojas prisijungs su el. paštu ir šiuo slaptažodžiu</p>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createMutation.mutate(newEmployee)}
                disabled={!newEmployee.firstName.trim() || !newEmployee.email.trim() || newEmployee.password.length < 6 || createMutation.isPending}
                data-testid="button-submit-employee"
              >
                Pridėti
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!users || users.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Nėra registruotų vartotojų</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {users.map((u) => {
            const initials = [u.firstName?.[0], u.lastName?.[0]]
              .filter(Boolean)
              .join("")
              .toUpperCase() || "?";
            const isSelf = u.id === currentUser?.id;

            return (
              <Card key={u.id} data-testid={`card-employee-${u.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={u.profileImageUrl || undefined} />
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {u.firstName} {u.lastName}
                        </span>
                        {isSelf && (
                          <Badge variant="secondary" className="text-xs">Jūs</Badge>
                        )}
                      </div>
                      {u.email && (
                        <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 mr-2">
                        <Switch
                          checked={u.isActive}
                          onCheckedChange={(checked) => activeMutation.mutate({ id: u.id, isActive: checked })}
                          disabled={isSelf}
                          data-testid={`switch-active-${u.id}`}
                        />
                        <span className={`text-xs ${u.isActive ? "text-green-600" : "text-muted-foreground"}`}>
                          {u.isActive ? "Aktyvus" : "Neaktyvus"}
                        </span>
                      </div>
                      {u.role === "owner" ? (
                        <Shield className="h-4 w-4 text-amber-500" />
                      ) : u.role === "admin" ? (
                        <Shield className="h-4 w-4 text-primary" />
                      ) : (
                        <UserIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                      <Select
                        value={u.role || "employee"}
                        onValueChange={(role) => roleMutation.mutate({ id: u.id, role })}
                        disabled={isSelf}
                      >
                        <SelectTrigger className="w-[140px]" data-testid={`select-role-${u.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">Savininkas</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="employee">Darbuotojas</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={u.workSchedule || "full_time"}
                        onValueChange={(v) => scheduleMutation.mutate({ id: u.id, workSchedule: v })}
                        disabled={!isManager}
                      >
                        <SelectTrigger className="w-[160px]" data-testid={`select-schedule-${u.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full_time">Pilnas etatas</SelectItem>
                          <SelectItem value="flex">Lankstus grafikas</SelectItem>
                        </SelectContent>
                      </Select>
                      {u.workSchedule === "flex" && (
                        <div className="flex items-center gap-1.5">
                          <ExpectedHoursInput
                            userId={u.id}
                            value={Number(u.expectedDailyHours ?? 8)}
                            disabled={!isManager || expectedHoursMutation.isPending}
                            onSave={(hours) => expectedHoursMutation.mutate({ id: u.id, expectedDailyHours: hours })}
                          />
                          <span className="text-xs text-muted-foreground">val./d.</span>
                        </div>
                      )}
                      {!isSelf && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" data-testid={`button-delete-employee-${u.id}`}>
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Ištrinti darbuotoją?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Ar tikrai norite ištrinti {u.firstName} {u.lastName}? Šis veiksmas negrįžtamas.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Atšaukti</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate(u.id)}>
                                Ištrinti
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
