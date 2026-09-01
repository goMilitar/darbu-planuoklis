import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { insertDayPlanSchema, insertPlanLineSchema } from "@shared/schema";
import { calculateDayPerformance, calculateDayLoad } from "@shared/benchmarks";
import { sendPerformanceAlert } from "./gmail";
import { checkForgottenClockOuts } from "./scheduler";

function isManagerRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

function getUserId(req: any): string {
  return req.user.authType === "email" ? req.user.userId : req.user.claims.sub;
}

const LT_TZ_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Vilnius",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getLocalDateStr(d: Date = new Date()): string {
  return LT_TZ_FORMATTER.format(d);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  app.get("/api/users", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser || !isManagerRole(currentUser.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const allUsers = await storage.getAllUsers();
      res.json(allUsers.map(({ password, ...u }) => u));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.patch("/api/users/:id/role", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser || !isManagerRole(currentUser.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { role } = req.body;
      if (!["owner", "admin", "employee"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      const updated = await storage.updateUserRole(req.params.id, role);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.patch("/api/users/:id/work-schedule", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser || !isManagerRole(currentUser.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { workSchedule } = req.body;
      if (!["full_time", "flex"].includes(workSchedule)) {
        return res.status(400).json({ message: "Invalid work schedule" });
      }
      const updated = await storage.updateUserWorkSchedule(req.params.id, workSchedule);
      const { password: _, ...safe } = updated;
      await storage.createEvent({
        userId: currentUser.id,
        entityType: "user",
        entityId: 0,
        action: "work_schedule_changed",
        payload: { targetUserId: req.params.id, workSchedule },
      });
      res.json(safe);
    } catch (error) {
      res.status(500).json({ message: "Failed to update work schedule" });
    }
  });

  app.patch("/api/users/:id/expected-daily-hours", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser || !isManagerRole(currentUser.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const raw = req.body?.expectedDailyHours;
      const hours = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
        return res.status(400).json({ message: "Invalid expected daily hours (0-24)" });
      }
      const target = await storage.getUser(req.params.id);
      if (!target) {
        return res.status(404).json({ message: "User not found" });
      }
      const rounded = Math.round(hours * 100) / 100;
      const updated = await storage.updateUserExpectedDailyHours(req.params.id, rounded);
      const { password: _, ...safe } = updated;
      await storage.createEvent({
        userId: currentUser.id,
        entityType: "user",
        entityId: 0,
        action: "expected_daily_hours_changed",
        payload: { targetUserId: req.params.id, expectedDailyHours: rounded },
      });
      res.json(safe);
    } catch (error) {
      res.status(500).json({ message: "Failed to update expected daily hours" });
    }
  });

  app.post("/api/users", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser || !isManagerRole(currentUser.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { firstName, lastName, email, password } = req.body;
      if (!firstName || typeof firstName !== "string" || firstName.trim().length === 0) {
        return res.status(400).json({ message: "Vardas privalomas" });
      }
      let hashedPassword: string | undefined;
      if (password && password.length >= 6) {
        const bcrypt = await import("bcryptjs");
        hashedPassword = await bcrypt.hash(password, 10);
      }
      const created = await storage.createEmployee({
        firstName: firstName.trim(),
        lastName: lastName?.trim() || undefined,
        email: email?.trim() || undefined,
        password: hashedPassword,
      });
      const { password: _, ...safeUser } = created;
      res.status(201).json(safeUser);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create employee" });
    }
  });

  app.delete("/api/users/:id", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser || !isManagerRole(currentUser.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (req.params.id === currentUser.id) {
        return res.status(400).json({ message: "Negalima ištrinti savęs" });
      }
      await storage.deleteUser(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  app.get("/api/day-plans", isAuthenticated, async (req: any, res) => {
    try {
      const { date, employeeId, startDate, endDate } = req.query;
      const currentUser = await storage.getUser(getUserId(req));

      if (date) {
        const plans = await storage.getDayPlansByDate(date as string);
        const safePlans = plans.map(({ employee, ...plan }) => {
          const { password, ...safeEmployee } = employee;
          return { ...plan, employee: safeEmployee };
        });
        if (!isManagerRole(currentUser?.role)) {
          return res.json(safePlans.filter((p) => p.employeeId === currentUser?.id));
        }
        return res.json(safePlans);
      }

      const targetEmployeeId = isManagerRole(currentUser?.role) && employeeId
        ? (employeeId as string)
        : currentUser?.id;

      if (!targetEmployeeId) return res.json([]);

      const plans = await storage.getDayPlansForEmployee(
        targetEmployeeId,
        startDate as string,
        endDate as string
      );
      res.json(plans);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch day plans" });
    }
  });

  app.get("/api/day-plans/:id", isAuthenticated, async (req: any, res) => {
    try {
      const plan = await storage.getDayPlan(Number(req.params.id));
      if (!plan) return res.status(404).json({ message: "Plan not found" });

      const currentUser = await storage.getUser(getUserId(req));
      if (!isManagerRole(currentUser?.role) && plan.employeeId !== currentUser?.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const lines = await storage.getPlanLines(plan.id);
      const employee = await storage.getUser(plan.employeeId);
      res.json({ ...plan, lines, employee });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch plan" });
    }
  });

  app.post("/api/day-plans", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser || !isManagerRole(currentUser.role)) {
        return res.status(403).json({ message: "Only admin can create plans" });
      }

      const parsed = insertDayPlanSchema.parse(req.body);
      const existing = await storage.getDayPlanByEmployeeAndDate(parsed.employeeId, parsed.date);
      if (existing) {
        return res.status(409).json({ message: "Plan already exists for this employee and date" });
      }

      const plan = await storage.createDayPlan(parsed);

      const targetEmployee = await storage.getUser(parsed.employeeId);
      if (targetEmployee && isManagerRole(targetEmployee.role)) {
        await storage.createPlanLine({
          dayPlanId: plan.id,
          taskType: "Planning",
          itemCode: null,
          description: "Planavimo darbai: Darbų delegavimas, pasiskirstymas, dienos plano uždarymas, AMZ planų sudarymas.",
          plannedQty: 1,
          actualQty: 0,
          unit: "vnt",
          status: "open",
          sortOrder: 0,
          carryoverParentLineId: null,
          isCarryover: false,
          carriedQty: 0,
          blockReason: null,
        });
      }

      await storage.createEvent({
        userId: currentUser.id,
        entityType: "day_plan",
        entityId: plan.id,
        action: "created",
        payload: { date: plan.date, employeeId: plan.employeeId },
      });

      res.status(201).json(plan);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to create plan" });
    }
  });

  app.post("/api/day-plans/generate", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser || !isManagerRole(currentUser.role)) {
        return res.status(403).json({ message: "Only admin can generate plans" });
      }

      const { date, employeeId } = req.body;
      if (!date || !employeeId) {
        return res.status(400).json({ message: "date and employeeId required" });
      }

      const existing = await storage.getDayPlanByEmployeeAndDate(employeeId, date);
      if (existing) {
        return res.status(409).json({ message: "Plan already exists for this date" });
      }

      const previousPlan = await storage.getLatestPlanBefore(employeeId, date);

      const newPlan = await storage.createDayPlan({
        date,
        employeeId,
        status: "planned",
        carryoverFromPlanId: previousPlan?.id || null,
      });

      let sortOrder = 0;

      if (previousPlan) {
        const previousLines = await storage.getPlanLines(previousPlan.id);

        for (const line of previousLines) {
          const effectiveDone = Math.min(line.actualQty, line.plannedQty);
          const undoneQty = Math.max(line.plannedQty - effectiveDone, 0);

          if (undoneQty > 0) {
            const existingCarryover = await storage.getCarryoverChildrenFromParent(line.id);
            if (existingCarryover.length === 0) {
              await storage.createPlanLine({
                dayPlanId: newPlan.id,
                taskType: line.taskType,
                itemCode: line.itemCode,
                description: line.description,
                plannedQty: undoneQty,
                actualQty: 0,
                unit: line.unit,
                status: "open",
                sortOrder: sortOrder++,
                carryoverParentLineId: line.id,
                isCarryover: true,
                carriedQty: undoneQty,
                blockReason: null,
              });
            }
          }
        }

        for (const line of previousLines) {
          await storage.createPlanLine({
            dayPlanId: newPlan.id,
            taskType: line.taskType,
            itemCode: line.itemCode,
            description: line.description,
            plannedQty: line.plannedQty,
            actualQty: 0,
            unit: line.unit,
            status: "open",
            sortOrder: sortOrder++,
            carryoverParentLineId: null,
            isCarryover: false,
            carriedQty: 0,
            blockReason: null,
          });
        }
      }

      const targetEmployee = await storage.getUser(employeeId);
      if (targetEmployee && isManagerRole(targetEmployee.role)) {
        const existingLines = await storage.getPlanLines(newPlan.id);
        const hasPlanningLine = existingLines.some(l => l.taskType === "Planning");
        if (!hasPlanningLine) {
          await storage.createPlanLine({
            dayPlanId: newPlan.id,
            taskType: "Planning",
            itemCode: null,
            description: "Planavimo darbai: Darbų delegavimas, pasiskirstymas, dienos plano uždarymas, AMZ planų sudarymas.",
            plannedQty: 1,
            actualQty: 0,
            unit: "vnt",
            status: "open",
            sortOrder: sortOrder++,
            carryoverParentLineId: null,
            isCarryover: false,
            carriedQty: 0,
            blockReason: null,
          });
        }
      }

      await storage.createEvent({
        userId: currentUser.id,
        entityType: "day_plan",
        entityId: newPlan.id,
        action: "generated",
        payload: { date, employeeId, fromPreviousPlan: !!previousPlan, previousPlanDate: previousPlan?.date },
      });

      const lines = await storage.getPlanLines(newPlan.id);
      res.status(201).json({ ...newPlan, lines });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to generate plan" });
    }
  });

  app.patch("/api/day-plans/:id/status", isAuthenticated, async (req: any, res) => {
    try {
      const { status } = req.body;
      if (!["planned", "in_progress", "done", "closed"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const plan = await storage.getDayPlan(Number(req.params.id));
      if (!plan) return res.status(404).json({ message: "Plan not found" });

      const currentUser = await storage.getUser(getUserId(req));
      if (!isManagerRole(currentUser?.role)) {
        return res.status(403).json({ message: "Only managers can update plan status" });
      }

      const updated = await storage.updateDayPlanStatus(plan.id, status);
      await storage.createEvent({
        userId: currentUser!.id,
        entityType: "day_plan",
        entityId: plan.id,
        action: "status_changed",
        payload: { from: plan.status, to: status },
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update status" });
    }
  });

  app.post("/api/day-plans/:id/clock-in", isAuthenticated, async (req: any, res) => {
    try {
      const plan = await storage.getDayPlan(Number(req.params.id));
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      if (plan.status === "closed") {
        return res.status(400).json({ message: "Planas jau uždarytas" });
      }

      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

      if (plan.employeeId !== currentUser.id) {
        return res.status(403).json({ message: "Galite pradėti tik savo darbą" });
      }
      if (currentUser.workSchedule !== "flex") {
        return res.status(403).json({ message: "Tik lankstaus grafiko darbuotojai gali žymėtis darbo pradžią" });
      }
      if (plan.workStartedAt) {
        return res.status(400).json({ message: "Darbo pradžia jau pažymėta" });
      }

      const todayStr = getLocalDateStr();
      if (plan.date !== todayStr) {
        return res.status(400).json({ message: "Galima žymėti tik šios dienos planą" });
      }

      const updated = await storage.setWorkStartedAt(plan.id, new Date());
      if (!updated) {
        return res.status(409).json({ message: "Darbo pradžia jau pažymėta" });
      }
      if (plan.status === "planned") {
        await storage.updateDayPlanStatus(plan.id, "in_progress");
      }
      await storage.createEvent({
        userId: currentUser.id,
        entityType: "day_plan",
        entityId: plan.id,
        action: "clock_in",
        payload: { workStartedAt: updated.workStartedAt },
      });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to clock in" });
    }
  });

  app.post("/api/day-plans/:id/clock-out", isAuthenticated, async (req: any, res) => {
    try {
      const plan = await storage.getDayPlan(Number(req.params.id));
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      if (plan.status === "closed") {
        return res.status(400).json({ message: "Planas jau uždarytas" });
      }

      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

      if (plan.employeeId !== currentUser.id) {
        return res.status(403).json({ message: "Galite baigti tik savo darbą" });
      }
      if (currentUser.workSchedule !== "flex") {
        return res.status(403).json({ message: "Tik lankstaus grafiko darbuotojai gali žymėtis darbo pabaigą" });
      }
      if (!plan.workStartedAt) {
        return res.status(400).json({ message: "Pirmiausia pažymėkite darbo pradžią" });
      }
      if (plan.workEndedAt) {
        return res.status(400).json({ message: "Darbo pabaiga jau pažymėta" });
      }

      const todayStr = getLocalDateStr();
      if (plan.date !== todayStr) {
        return res.status(400).json({ message: "Galima žymėti tik šios dienos planą" });
      }

      const updated = await storage.setWorkEndedAt(plan.id, new Date());
      if (!updated) {
        return res.status(409).json({ message: "Darbo pabaiga jau pažymėta" });
      }
      await storage.createEvent({
        userId: currentUser.id,
        entityType: "day_plan",
        entityId: plan.id,
        action: "clock_out",
        payload: { workEndedAt: updated.workEndedAt },
      });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to clock out" });
    }
  });

  app.post("/api/day-plans/:id/reset-clock-in", isAuthenticated, async (req: any, res) => {
    try {
      const plan = await storage.getDayPlan(Number(req.params.id));
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      if (plan.status === "closed") {
        return res.status(400).json({ message: "Planas jau uždarytas" });
      }

      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

      if (plan.employeeId !== currentUser.id) {
        return res.status(403).json({ message: "Galite atšaukti tik savo darbo pradžią" });
      }
      if (currentUser.workSchedule !== "flex") {
        return res.status(403).json({ message: "Tik lankstaus grafiko darbuotojai gali atšaukti darbo pradžią" });
      }
      if (!plan.workStartedAt) {
        return res.status(400).json({ message: "Darbo pradžia dar nepažymėta" });
      }
      if (plan.workEndedAt) {
        return res.status(400).json({ message: "Negalima atšaukti — darbo pabaiga jau pažymėta. Kreipkitės į administratorių." });
      }

      const RESET_WINDOW_MS = 5 * 60 * 1000;
      const startedAt = new Date(plan.workStartedAt).getTime();
      const ageMs = Date.now() - startedAt;
      if (ageMs > RESET_WINDOW_MS) {
        return res.status(400).json({ message: "Atšaukti galima tik per 5 minutes nuo darbo pradžios. Kreipkitės į administratorių." });
      }

      const previousStartedAt = plan.workStartedAt;
      const previousStatus = plan.status;
      let updated = await storage.resetWorkStartedAt(plan.id);
      if (!updated) {
        return res.status(409).json({ message: "Negalima atšaukti — darbo pabaiga jau pažymėta. Kreipkitės į administratorių." });
      }

      let revertedStatus: string | undefined;
      if (updated.status === "in_progress") {
        const lines = await storage.getPlanLines(plan.id);
        const hasActualWork = lines.some((l) => l.actualQty > 0);
        if (!hasActualWork) {
          updated = await storage.updateDayPlanStatus(plan.id, "planned");
          revertedStatus = "planned";
        }
      }

      await storage.createEvent({
        userId: currentUser.id,
        entityType: "day_plan",
        entityId: plan.id,
        action: "clock_in_reset",
        payload: {
          previousWorkStartedAt: previousStartedAt,
          previousStatus,
          ...(revertedStatus ? { revertedStatus } : {}),
        },
      });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to reset clock-in" });
    }
  });

  app.patch("/api/day-plans/:id/work-times", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser || !isManagerRole(currentUser.role)) {
        return res.status(403).json({ message: "Tik administratorius gali keisti darbo laiką" });
      }

      const plan = await storage.getDayPlan(Number(req.params.id));
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      if (plan.status === "closed") {
        return res.status(400).json({ message: "Negalima keisti uždaryto plano darbo laiko" });
      }

      const employee = await storage.getUser(plan.employeeId);
      if (employee?.workSchedule !== "flex") {
        return res.status(400).json({ message: "Darbo laiką galima keisti tik lankstaus grafiko darbuotojams" });
      }

      const body = req.body || {};
      const hasStart = Object.prototype.hasOwnProperty.call(body, "workStartedAt");
      const hasEnd = Object.prototype.hasOwnProperty.call(body, "workEndedAt");

      if (!hasStart && !hasEnd) {
        return res.status(400).json({ message: "Nurodykite bent vieną lauką" });
      }

      const updates: { workStartedAt?: Date | null; workEndedAt?: Date | null } = {};

      const parseTs = (val: unknown, label: string): Date | null => {
        if (val === null || val === "") return null;
        if (typeof val !== "string") {
          throw new Error(`${label} turi būti laiko žymė arba null`);
        }
        const d = new Date(val);
        if (isNaN(d.getTime())) {
          throw new Error(`Neteisingas ${label} formatas`);
        }
        return d;
      };

      if (hasStart) updates.workStartedAt = parseTs(body.workStartedAt, "darbo pradžia");
      if (hasEnd) updates.workEndedAt = parseTs(body.workEndedAt, "darbo pabaiga");

      const finalStart = hasStart ? updates.workStartedAt : (plan.workStartedAt ? new Date(plan.workStartedAt) : null);
      const finalEnd = hasEnd ? updates.workEndedAt : (plan.workEndedAt ? new Date(plan.workEndedAt) : null);

      if (finalEnd && !finalStart) {
        return res.status(400).json({ message: "Negalima nustatyti darbo pabaigos be darbo pradžios" });
      }
      if (finalStart && finalEnd && finalEnd.getTime() < finalStart.getTime()) {
        return res.status(400).json({ message: "Darbo pabaiga negali būti anksčiau už darbo pradžią" });
      }

      const previous = {
        workStartedAt: plan.workStartedAt,
        workEndedAt: plan.workEndedAt,
      };

      const updated = await storage.updateWorkTimes(plan.id, updates);
      if (!updated) return res.status(404).json({ message: "Plan not found" });

      await storage.createEvent({
        userId: currentUser.id,
        entityType: "day_plan",
        entityId: plan.id,
        action: "work_times_edited",
        payload: {
          targetEmployeeId: plan.employeeId,
          previous,
          updated: {
            workStartedAt: updated.workStartedAt,
            workEndedAt: updated.workEndedAt,
          },
        },
      });

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update work times" });
    }
  });

  app.post("/api/day-plans/:id/close", isAuthenticated, async (req: any, res) => {
    try {
      const plan = await storage.getDayPlan(Number(req.params.id));
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      if (plan.status === "closed") {
        return res.status(400).json({ message: "Plan already closed" });
      }

      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

      const isManager = isManagerRole(currentUser.role);
      const isFlexSelfClose =
        !isManager &&
        currentUser.workSchedule === "flex" &&
        plan.employeeId === currentUser.id;

      if (!isManager && !isFlexSelfClose) {
        return res.status(403).json({ message: "Only managers can close plans" });
      }

      const { closeComment } = req.body || {};

      const lines = await storage.getPlanLines(plan.id);

      const planEmployee = await storage.getUser(plan.employeeId);
      const employeeIsAdmin = isManagerRole(planEmployee?.role);

      if (isFlexSelfClose) {
        const todayStr = getLocalDateStr();
        if (plan.date !== todayStr) {
          return res.status(400).json({ message: "Galite uždaryti tik šios dienos planą. Senesnius planus uždarys admin." });
        }
        if (!plan.workStartedAt) {
          return res.status(400).json({ message: "Pirmiausia pažymėkite darbo pradžią" });
        }
        if (!plan.workEndedAt) {
          return res.status(400).json({ message: "Pirmiausia pažymėkite darbo pabaigą" });
        }
      } else {
        const employeeIsFlex = planEmployee?.workSchedule === "flex";
        const loadCheck = calculateDayLoad(lines.map(l => ({
          taskType: l.taskType,
          plannedQty: l.plannedQty,
          status: l.status,
        })), employeeIsAdmin ? { skipDiversityDiscount: true } : undefined);

        if (!employeeIsFlex && loadCheck.loadPct < 100 && loadCheck.totalFraction > 0) {
          return res.status(400).json({ message: "Negalima uždaryti dienos — dienos apkrova nepilna. Pridėkite užduočių, kad apkrova siektų bent 100%." });
        }

        const activeLines = lines.filter(l => l.status !== "blocked" && l.status !== "skipped");
        const unverifiedLines = activeLines.filter(l => !l.verifiedByAdmin);
        if (unverifiedLines.length > 0) {
          return res.status(400).json({ message: `Negalima uždaryti dienos — ${unverifiedLines.length} eilutė(-ės) dar nepatvirtinta(-os) admin. Patvirtinkite visas eilutes prieš uždarymą.` });
        }
      }

      const perf = calculateDayPerformance(lines.map(l => ({
        taskType: l.taskType,
        actualQty: l.actualQty,
        plannedQty: l.plannedQty,
        status: l.status,
      })), employeeIsAdmin ? { skipDiversityDiscount: true } : undefined);
      const totalPlanned = lines.reduce((s, l) => s + l.plannedQty, 0);
      const totalActual = lines.reduce((s, l) => s + Math.min(l.actualQty, l.plannedQty), 0);
      const allDone = totalPlanned === 0 || totalActual >= totalPlanned;

      if (!allDone && (!closeComment || typeof closeComment !== "string" || closeComment.trim().length === 0)) {
        return res.status(400).json({ message: "Komentaras privalomas, kai ne visi darbai atlikti" });
      }

      const nextWorkday = new Date(plan.date);
      do {
        nextWorkday.setDate(nextWorkday.getDate() + 1);
      } while (nextWorkday.getDay() === 0 || nextWorkday.getDay() === 6);
      const nextWorkdayStr = nextWorkday.toISOString().split("T")[0];

      let tomorrowPlan = await storage.getDayPlanByEmployeeAndDate(plan.employeeId, nextWorkdayStr);

      const linesToCarry = [];
      for (const line of lines) {
        const effectiveDone = Math.min(line.actualQty, line.plannedQty);
        const undoneQty = Math.max(line.plannedQty - effectiveDone, 0);

        if (undoneQty > 0) {
          const existingCarryover = await storage.getCarryoverChildrenFromParent(line.id);
          if (existingCarryover.length === 0) {
            linesToCarry.push({ line, undoneQty });
          }
        }

        if (line.status === "open" || line.status === "partial") {
          const newStatus = line.actualQty >= line.plannedQty ? "done" :
                            line.actualQty > 0 ? "partial" : line.status;
          if (newStatus !== line.status) {
            await storage.updatePlanLine(line.id, { status: newStatus });
          }
        }
      }

      if (linesToCarry.length > 0) {
        if (!tomorrowPlan) {
          tomorrowPlan = await storage.createDayPlan({
            date: nextWorkdayStr,
            employeeId: plan.employeeId,
            status: "planned",
            carryoverFromPlanId: plan.id,
          });
        }

        const existingTomorrowLines = await storage.getPlanLines(tomorrowPlan.id);
        let nextSort = existingTomorrowLines.length > 0
          ? Math.max(...existingTomorrowLines.map((l) => l.sortOrder)) + 1
          : 0;

        for (const { line, undoneQty } of linesToCarry) {
          await storage.createPlanLine({
            dayPlanId: tomorrowPlan.id,
            taskType: line.taskType,
            itemCode: line.itemCode,
            description: line.description,
            plannedQty: undoneQty,
            actualQty: 0,
            unit: line.unit,
            status: "open",
            sortOrder: nextSort++,
            carryoverParentLineId: line.id,
            isCarryover: true,
            carriedQty: undoneQty,
            blockReason: null,
          });
        }
      }

      const closedPlan = await storage.closeDayPlan(
        plan.id,
        allDone ? undefined : closeComment?.trim(),
        perf.lines.length > 0 ? perf.performancePct : undefined,
      );

      const planEmployeeIsFlex = planEmployee?.workSchedule === "flex";
      const flexLoad = calculateDayLoad(lines.map(l => ({
        taskType: l.taskType,
        plannedQty: l.plannedQty,
        status: l.status,
      })), employeeIsAdmin ? { skipDiversityDiscount: true } : undefined);
      const plannedMinutes = Math.round(flexLoad.plannedHours * 60);
      const actualMinutes = (plan.workStartedAt && plan.workEndedAt)
        ? Math.max(0, Math.round((new Date(plan.workEndedAt).getTime() - new Date(plan.workStartedAt).getTime()) / 60000))
        : 0;
      const overrunMinutes = Math.max(0, actualMinutes - plannedMinutes);
      const withinPlannedTime = actualMinutes > 0 && plannedMinutes > 0 && actualMinutes <= plannedMinutes;

      await storage.createEvent({
        userId: currentUser!.id,
        entityType: "day_plan",
        entityId: plan.id,
        action: isFlexSelfClose ? "self_closed" : "closed",
        payload: {
          carriedLines: linesToCarry.length,
          tomorrowPlanId: tomorrowPlan?.id || null,
          performanceScore: perf.performancePct,
          performanceDetails: perf.lines,
          ...(isFlexSelfClose ? { selfClose: true } : {}),
          ...(planEmployeeIsFlex ? { plannedMinutes, actualMinutes, overrunMinutes } : {}),
        },
      });

      if (perf.lines.length > 0 && perf.performancePct < 95) {
        const empName = planEmployee
          ? `${planEmployee.firstName || ""} ${planEmployee.lastName || ""}`.trim()
          : plan.employeeId;
        sendPerformanceAlert({
          employeeName: empName,
          date: plan.date,
          performancePct: perf.performancePct,
          closeComment: allDone ? undefined : closeComment?.trim(),
        }).catch(() => {});
      }

      res.json({
        ...closedPlan,
        ...(planEmployeeIsFlex ? { plannedMinutes, actualMinutes, overrunMinutes, withinPlannedTime } : {}),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to close plan" });
    }
  });

  app.get("/api/day-plans/:id/performance", isAuthenticated, async (req: any, res) => {
    try {
      const plan = await storage.getDayPlan(Number(req.params.id));
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      const lines = await storage.getPlanLines(plan.id);
      const planEmployee = await storage.getUser(plan.employeeId);
      const employeeIsAdmin = isManagerRole(planEmployee?.role);
      const perf = calculateDayPerformance(lines.map(l => ({
        taskType: l.taskType,
        actualQty: l.actualQty,
        plannedQty: l.plannedQty,
        status: l.status,
      })), employeeIsAdmin ? { skipDiversityDiscount: true } : undefined);
      res.json(perf);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/plan-lines", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(getUserId(req));
      const parsed = insertPlanLineSchema.parse(req.body);

      const plan = await storage.getDayPlan(parsed.dayPlanId);
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      if (!isManagerRole(currentUser?.role)) {
        return res.status(403).json({ message: "Only managers can add plan lines" });
      }

      if (parsed.taskType.startsWith("Surplus Inbound") && (!parsed.itemCode || !parsed.itemCode.trim())) {
        return res.status(400).json({ message: "Prekės kodas privalomas Surplus Inbound užduotims (SKU or Supplier Code)" });
      }

      const line = await storage.createPlanLine(parsed);
      await storage.createEvent({
        userId: currentUser!.id,
        entityType: "plan_line",
        entityId: line.id,
        action: "created",
        payload: { dayPlanId: plan.id, taskType: line.taskType },
      });
      res.status(201).json(line);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to create line" });
    }
  });

  app.patch("/api/plan-lines/:id", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(getUserId(req));
      const line = await storage.getPlanLine(Number(req.params.id));
      if (!line) return res.status(404).json({ message: "Line not found" });

      const plan = await storage.getDayPlan(line.dayPlanId);
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      if (plan.status === "closed") {
        return res.status(400).json({ message: "Cannot modify closed plan" });
      }
      const isEmployee = !isManagerRole(currentUser?.role);
      if (isEmployee && plan.employeeId !== currentUser?.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { actualQty, status, plannedQty, blockReason, taskType, itemCode, description, unit, sortOrder, verifiedByAdmin } = req.body;

      if (isEmployee) {
        const hasNonActualFields = status !== undefined || plannedQty !== undefined || blockReason !== undefined || taskType !== undefined || itemCode !== undefined || description !== undefined || unit !== undefined || sortOrder !== undefined || verifiedByAdmin !== undefined;
        if (hasNonActualFields) {
          return res.status(403).json({ message: "Darbuotojas gali keisti tik atliktą kiekį" });
        }
      }
      const validStatuses = ["open", "partial", "done", "skipped", "blocked"];
      if (status !== undefined && !validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      if (actualQty !== undefined && (typeof actualQty !== "number" || actualQty < 0)) {
        return res.status(400).json({ message: "Invalid actualQty" });
      }
      if (plannedQty !== undefined && (typeof plannedQty !== "number" || plannedQty < 0)) {
        return res.status(400).json({ message: "Invalid plannedQty" });
      }

      const updates: Partial<typeof line> = {};

      if (actualQty !== undefined) updates.actualQty = actualQty;
      if (status !== undefined) updates.status = status;
      if (plannedQty !== undefined) updates.plannedQty = plannedQty;
      if (blockReason !== undefined) updates.blockReason = blockReason;
      if (taskType !== undefined) updates.taskType = taskType;
      if (itemCode !== undefined) updates.itemCode = itemCode;
      if (description !== undefined) updates.description = description;
      if (unit !== undefined) updates.unit = unit;
      if (sortOrder !== undefined) updates.sortOrder = sortOrder;
      if (verifiedByAdmin !== undefined) updates.verifiedByAdmin = verifiedByAdmin;

      if (updates.actualQty !== undefined && updates.status === undefined) {
        const newActual = updates.actualQty;
        const planned = updates.plannedQty ?? line.plannedQty;
        if (newActual >= planned) {
          updates.status = "done";
        } else if (newActual > 0) {
          updates.status = "partial";
        } else {
          updates.status = "open";
        }
      }

      if (isEmployee && updates.actualQty !== undefined && updates.actualQty !== line.actualQty) {
        updates.verifiedByAdmin = false;
      }

      const updated = await storage.updatePlanLine(line.id, updates);

      if (plan.status === "planned" && updates.actualQty !== undefined && updates.actualQty > 0) {
        await storage.updateDayPlanStatus(plan.id, "in_progress");
      }

      await storage.createEvent({
        userId: currentUser!.id,
        entityType: "plan_line",
        entityId: line.id,
        action: "updated",
        payload: updates,
      });

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update line" });
    }
  });

  app.delete("/api/plan-lines/:id", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser || !isManagerRole(currentUser.role)) {
        return res.status(403).json({ message: "Only admin can delete lines" });
      }

      const line = await storage.getPlanLine(Number(req.params.id));
      if (!line) return res.status(404).json({ message: "Line not found" });

      await storage.deletePlanLine(line.id);
      await storage.createEvent({
        userId: currentUser.id,
        entityType: "plan_line",
        entityId: line.id,
        action: "deleted",
        payload: { dayPlanId: line.dayPlanId },
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete line" });
    }
  });

  app.get("/api/admin/flex-hours", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser || !isManagerRole(currentUser.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { startDate, endDate, employeeId } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate required" });
      }

      const rows = await storage.getFlexHours(
        startDate as string,
        endDate as string,
        employeeId ? (employeeId as string) : undefined
      );

      type FlexTask = {
        taskType: string;
        plannedQty: number;
        actualQty: number;
        unit: string | null;
        status: string;
      };

      const employeesMap = new Map<string, {
        employeeId: string;
        employeeName: string;
        expectedDailyHours: number;
        days: {
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
        }[];
        totalHours: number;
        totalPlannedHours: number;
      }>();

      for (const r of rows) {
        const start = r.workStartedAt ? new Date(r.workStartedAt) : null;
        const end = r.workEndedAt ? new Date(r.workEndedAt) : null;
        const complete = !!(start && end && end > start);
        const hours = complete ? (end!.getTime() - start!.getTime()) / 3600000 : 0;
        const expected = Number(r.employeeExpectedDailyHours ?? 8);

        if (!employeesMap.has(r.employeeId)) {
          const fullName = `${r.employeeFirstName || ""} ${r.employeeLastName || ""}`.trim() || r.employeeId;
          employeesMap.set(r.employeeId, {
            employeeId: r.employeeId,
            employeeName: fullName,
            expectedDailyHours: expected,
            days: [],
            totalHours: 0,
            totalPlannedHours: 0,
          });
        }
        const emp = employeesMap.get(r.employeeId)!;
        if (start || end) {
          const lines = await storage.getPlanLines(r.planId);
          const activeLines = lines.filter(l => l.status !== "blocked" && l.status !== "skipped");
          const tasks: FlexTask[] = activeLines.map(l => ({
            taskType: l.taskType,
            plannedQty: l.plannedQty,
            actualQty: l.actualQty,
            unit: l.unit,
            status: l.status,
          }));
          const tasksPlannedQty = activeLines.reduce((s, l) => s + (l.plannedQty || 0), 0);
          const tasksActualQty = activeLines.reduce((s, l) => s + Math.min(l.actualQty || 0, l.plannedQty || 0), 0);
          const tasksCompletionPct = tasksPlannedQty > 0
            ? Math.round((tasksActualQty / tasksPlannedQty) * 100)
            : 0;
          const tasksDone = tasksPlannedQty > 0 && activeLines.every(l => (l.actualQty || 0) >= (l.plannedQty || 0));

          const employeeIsAdmin = isManagerRole((r as any).employeeRole);
          const dayLoad = calculateDayLoad(
            activeLines.map(l => ({
              taskType: l.taskType,
              plannedQty: l.plannedQty,
              status: l.status,
            })),
            employeeIsAdmin ? { skipDiversityDiscount: true } : undefined,
          );
          const plannedHoursForDay = dayLoad.plannedHours;

          emp.days.push({
            planId: r.planId,
            date: r.date,
            workStartedAt: start ? start.toISOString() : null,
            workEndedAt: end ? end.toISOString() : null,
            hours: Math.round(hours * 100) / 100,
            plannedHours: Math.round(plannedHoursForDay * 100) / 100,
            deltaHours: complete ? Math.round((hours - plannedHoursForDay) * 100) / 100 : 0,
            complete,
            tasks,
            tasksPlannedQty,
            tasksActualQty,
            tasksCompletionPct,
            tasksDone,
            planStatus: (r as any).planStatus ?? "",
          });
          emp.totalHours += hours;
          emp.totalPlannedHours += plannedHoursForDay;
        }
      }

      const employees = Array.from(employeesMap.values())
        .map((e) => ({
          ...e,
          totalHours: Math.round(e.totalHours * 100) / 100,
          totalPlannedHours: Math.round(e.totalPlannedHours * 100) / 100,
          totalDeltaHours: Math.round((e.totalHours - e.totalPlannedHours) * 100) / 100,
        }))
        .filter((e) => e.days.length > 0)
        .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

      const grandTotalHours = Math.round(
        employees.reduce((s, e) => s + e.totalHours, 0) * 100
      ) / 100;
      const grandTotalPlannedHours = Math.round(
        employees.reduce((s, e) => s + e.totalPlannedHours, 0) * 100
      ) / 100;

      res.json({
        startDate,
        endDate,
        employees,
        grandTotalHours,
        grandTotalPlannedHours,
        grandTotalDeltaHours: Math.round((grandTotalHours - grandTotalPlannedHours) * 100) / 100,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch flex hours" });
    }
  });

  app.get("/api/analytics", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(getUserId(req));
      const { employeeId, startDate, endDate, taskType } = req.query;

      if (!currentUser || currentUser.role !== "owner") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const targetEmployeeId = employeeId as string || undefined;

      const analytics = await storage.getAnalytics(
        targetEmployeeId,
        startDate as string,
        endDate as string,
        taskType as string | undefined
      );

      const flexEmployees = (analytics.byEmployee as any[]).filter(e => e.workSchedule === "flex");
      if (flexEmployees.length > 0) {
        const flexStatsByEmployee: Record<string, any> = {};
        for (const emp of flexEmployees) {
          const empPlans = await storage.getDayPlansForEmployee(
            emp.employeeId,
            startDate as string | undefined,
            endDate as string | undefined,
          );
          let workedMinutes = 0;
          let plannedMinutes = 0;
          let daysWithinTime = 0;
          let daysOverTime = 0;
          let closedDays = 0;
          const recent: { date: string; workedMinutes: number; plannedMinutes: number; overrunMinutes: number }[] = [];
          for (const p of empPlans) {
            if (p.status !== "closed") continue;
            const w = (p.workStartedAt && p.workEndedAt)
              ? Math.max(0, Math.round((new Date(p.workEndedAt).getTime() - new Date(p.workStartedAt).getTime()) / 60000))
              : 0;
            const lines = await storage.getPlanLines(p.id);
            const load = calculateDayLoad(lines.map(l => ({
              taskType: l.taskType,
              plannedQty: l.plannedQty,
              status: l.status,
            })));
            const planned = Math.round(load.plannedHours * 60);
            workedMinutes += w;
            plannedMinutes += planned;
            closedDays += 1;
            if (w > 0 && planned > 0) {
              if (w <= planned) daysWithinTime += 1; else daysOverTime += 1;
            }
            recent.push({
              date: p.date,
              workedMinutes: w,
              plannedMinutes: planned,
              overrunMinutes: Math.max(0, w - planned),
            });
          }
          flexStatsByEmployee[emp.employeeId] = {
            workedMinutes,
            plannedMinutes,
            overrunMinutes: Math.max(0, workedMinutes - plannedMinutes),
            daysWithinTime,
            daysOverTime,
            closedDays,
            recent: recent.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30),
          };
        }
        analytics.byEmployee = (analytics.byEmployee as any[]).map(e => ({
          ...e,
          flexStats: flexStatsByEmployee[e.employeeId],
        }));
      }

      if (startDate && endDate) {
        const absences = await storage.getAbsencesByDateRange(
          startDate as string,
          endDate as string,
          targetEmployeeId
        );
        const allUsers = await storage.getAllUsers();
        analytics.absences = absences.map((a: any) => {
          const emp = allUsers.find(u => u.id === a.employeeId);
          return {
            ...a,
            employeeName: emp ? `${emp.firstName || ""} ${emp.lastName || ""}`.trim() : a.employeeId,
          };
        });
      } else {
        analytics.absences = [];
      }

      res.json(analytics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get("/api/my-performance", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const currentUser = await storage.getUser(userId);
      if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

      const todayStr = getLocalDateStr();
      const todayLocal = new Date(todayStr + "T00:00:00");
      const dow = todayLocal.getDay();
      const weekStartLocal = new Date(todayLocal);
      weekStartLocal.setDate(todayLocal.getDate() - dow + (dow === 0 ? -6 : 1));
      const weekStartStr = `${weekStartLocal.getFullYear()}-${String(weekStartLocal.getMonth() + 1).padStart(2, "0")}-${String(weekStartLocal.getDate()).padStart(2, "0")}`;
      const monthStartStr = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, "0")}-01`;

      const allPlans = await storage.getDayPlansForEmployee(userId);
      const closedPlans = allPlans.filter(p => p.status === "closed");

      const isAdmin = isManagerRole(currentUser.role);
      const perfOptions = isAdmin ? { skipDiversityDiscount: true } : undefined;

      const planPerformances = await Promise.all(
        closedPlans.map(async (plan) => {
          const lines = await storage.getPlanLines(plan.id);
          const perf = calculateDayPerformance(
            lines.map(l => ({ taskType: l.taskType, actualQty: l.actualQty, plannedQty: l.plannedQty, status: l.status })),
            perfOptions
          );
          return { date: plan.date, performancePct: perf.performancePct, score: plan.performanceScore ?? perf.performancePct };
        })
      );

      const weekPerfs = planPerformances.filter(p => p.date >= weekStartStr && p.date <= todayStr);
      const monthPerfs = planPerformances.filter(p => p.date >= monthStartStr && p.date <= todayStr);

      const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

      const allAbsences = await storage.getAbsencesByDateRange("2020-01-01", todayStr, userId);
      const weekAbsences = allAbsences.filter(a => a.date >= weekStartStr && a.date <= todayStr);
      const monthAbsences = allAbsences.filter(a => a.date >= monthStartStr && a.date <= todayStr);

      const isFlex = currentUser.workSchedule === "flex";
      let workedTime: any = undefined;
      if (isFlex) {
        const workedByDate = new Map<string, number>();
        const plannedByDate = new Map<string, number>();
        for (const p of allPlans) {
          if (p.workStartedAt && p.workEndedAt) {
            const mins = Math.max(
              0,
              Math.round((new Date(p.workEndedAt).getTime() - new Date(p.workStartedAt).getTime()) / 60000)
            );
            workedByDate.set(p.date, (workedByDate.get(p.date) || 0) + mins);
          }
          if (p.status === "closed") {
            const planLines = await storage.getPlanLines(p.id);
            const load = calculateDayLoad(planLines.map(l => ({
              taskType: l.taskType,
              plannedQty: l.plannedQty,
              status: l.status,
            })), perfOptions);
            const planned = Math.round(load.plannedHours * 60);
            if (planned > 0) {
              plannedByDate.set(p.date, (plannedByDate.get(p.date) || 0) + planned);
            }
          }
        }
        const sumIn = (m: Map<string, number>, predicate: (date: string) => boolean) => {
          let total = 0;
          m.forEach((v, d) => { if (predicate(d)) total += v; });
          return total;
        };
        const allDates = new Set<string>([...workedByDate.keys(), ...plannedByDate.keys()]);
        const recent = Array.from(allDates)
          .sort((a, b) => b.localeCompare(a))
          .slice(0, 14)
          .map((date) => ({
            date,
            minutes: workedByDate.get(date) || 0,
            plannedMinutes: plannedByDate.get(date) || 0,
          }));
        workedTime = {
          weekMinutes: sumIn(workedByDate, d => d >= weekStartStr && d <= todayStr),
          monthMinutes: sumIn(workedByDate, d => d >= monthStartStr && d <= todayStr),
          totalMinutes: sumIn(workedByDate, () => true),
          weekPlannedMinutes: sumIn(plannedByDate, d => d >= weekStartStr && d <= todayStr),
          monthPlannedMinutes: sumIn(plannedByDate, d => d >= monthStartStr && d <= todayStr),
          totalPlannedMinutes: sumIn(plannedByDate, () => true),
          recent,
        };
      }

      res.json({
        totalClosedPlans: closedPlans.length,
        weekAvg: avg(weekPerfs.map(p => p.score)),
        weekDays: weekPerfs.length,
        monthAvg: avg(monthPerfs.map(p => p.score)),
        monthDays: monthPerfs.length,
        overallAvg: avg(planPerformances.map(p => p.score)),
        recentDays: planPerformances.slice(0, 14).map(p => ({ date: p.date, score: p.score })),
        workSchedule: currentUser.workSchedule,
        workedTime,
        absences: {
          total: allAbsences.length,
          week: weekAbsences.length,
          month: monthAbsences.length,
          recent: allAbsences.slice(0, 10).map(a => ({ date: a.date, reason: a.reason })),
        },
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch performance" });
    }
  });

  app.get("/api/my-open-clock-ins", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const currentUser = await storage.getUser(userId);
      if (!currentUser) return res.status(401).json({ message: "Unauthorized" });
      if (currentUser.workSchedule !== "flex") {
        return res.json({ openClockIns: [] });
      }
      const openPlans = await storage.getOpenClockInsForEmployee(userId);
      const todayStr = getLocalDateStr();
      const openClockIns = openPlans.map((p) => ({
        id: p.id,
        date: p.date,
        workStartedAt: p.workStartedAt,
        isToday: p.date === todayStr,
      }));
      res.json({ openClockIns });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch open clock-ins" });
    }
  });

  app.post("/api/forgotten-clock-outs/check", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser || !isManagerRole(currentUser.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const result = await checkForgottenClockOuts();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to run reminder check" });
    }
  });

  app.get("/api/events", isAuthenticated, async (req: any, res) => {
    try {
      const { entityType, entityId, limit } = req.query;
      const eventList = await storage.getEvents(
        entityType as string,
        entityId ? Number(entityId) : undefined,
        limit ? Number(limit) : 50
      );
      res.json(eventList);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  app.patch("/api/users/:id/active", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser || !isManagerRole(currentUser.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { isActive } = req.body;
      if (typeof isActive !== "boolean") {
        return res.status(400).json({ message: "isActive must be boolean" });
      }
      const updated = await storage.updateUserActive(req.params.id, isActive);
      const { password: _, ...safe } = updated;
      res.json(safe);
    } catch (error) {
      res.status(500).json({ message: "Failed to update active status" });
    }
  });

  app.get("/api/pending-plans", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser || !isManagerRole(currentUser.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const allUsers = await storage.getAllUsers();
      const activeUsers = allUsers.filter(u => u.isActive);
      const todayPlans = await storage.getDayPlansByDate(date);
      const todayAbsences = await storage.getAbsencesByDate(date);

      const employeesWithPlans = new Set(todayPlans.map(p => p.employeeId));
      const employeesWithAbsences = new Set(todayAbsences.map(a => a.employeeId));

      const missing = activeUsers
        .filter(u => u.role !== "owner" && u.workSchedule !== "flex" && !employeesWithPlans.has(u.id) && !employeesWithAbsences.has(u.id))
        .map(({ password, ...u }) => u);

      const absences = todayAbsences.map(a => {
        const emp = allUsers.find(u => u.id === a.employeeId);
        return {
          ...a,
          employeeName: emp ? `${emp.firstName || ""} ${emp.lastName || ""}`.trim() : a.employeeId,
        };
      });

      const unclosedPlans = await storage.getUnclosedPlansBeforeDate(date);
      const unclosed = unclosedPlans.map(p => {
        const emp = allUsers.find(u => u.id === p.employeeId);
        return {
          id: p.id,
          date: p.date,
          status: p.status,
          employeeId: p.employeeId,
          employeeName: emp ? `${emp.firstName || ""} ${emp.lastName || ""}`.trim() : p.employeeId,
        };
      });

      const forgottenClockOutPlans = await storage.getOpenClockInsBeforeDate(date);
      const forgottenClockOuts = forgottenClockOutPlans.map((p) => ({
        id: p.id,
        date: p.date,
        employeeId: p.employeeId,
        employeeName:
          `${p.employee.firstName || ""} ${p.employee.lastName || ""}`.trim() || p.employeeId,
        workStartedAt: p.workStartedAt,
      }));

      res.json({ missing, absences, unclosed, forgottenClockOuts, date });
    } catch (error) {
      res.status(500).json({ message: "Failed to check pending plans" });
    }
  });

  app.delete("/api/day-plans/:id", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser || !isManagerRole(currentUser.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const plan = await storage.getDayPlan(Number(req.params.id));
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      if (plan.status === "closed") {
        return res.status(400).json({ message: "Negalima trinti uždaryto plano" });
      }
      await storage.deleteDayPlan(plan.id);
      await storage.createEvent({
        userId: currentUser.id,
        entityType: "day_plan",
        entityId: plan.id,
        action: "deleted",
        payload: { employeeId: plan.employeeId, date: plan.date },
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete plan" });
    }
  });

  const VALID_ABSENCE_REASONS = ["Nėra darbe", "Atostogauja", "Pavaduoja kolegą", "Nedarbingumo lapas"];

  app.get("/api/absences", isAuthenticated, async (req: any, res) => {
    try {
      const { date } = req.query;
      if (!date) {
        return res.status(400).json({ message: "date query parameter required" });
      }
      const absences = await storage.getAbsencesByDate(date as string);
      res.json(absences);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch absences" });
    }
  });

  app.post("/api/absences", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser || !isManagerRole(currentUser.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { employeeId, date, reason } = req.body;
      if (!employeeId || !date || !reason) {
        return res.status(400).json({ message: "employeeId, date, reason required" });
      }
      if (!VALID_ABSENCE_REASONS.includes(reason)) {
        return res.status(400).json({ message: "Invalid absence reason" });
      }
      const employee = await storage.getUser(employeeId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }
      const existing = await storage.getAbsenceByEmployeeAndDate(employeeId, date);
      if (existing) {
        return res.status(409).json({ message: "Absence already recorded for this date" });
      }
      const absence = await storage.createAbsence({
        employeeId,
        date,
        reason,
        createdBy: currentUser.id,
      });
      res.status(201).json(absence);
    } catch (error) {
      res.status(500).json({ message: "Failed to create absence" });
    }
  });

  app.delete("/api/absences/:id", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(getUserId(req));
      if (!currentUser || !isManagerRole(currentUser.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deleteAbsence(Number(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete absence" });
    }
  });

  app.post("/api/seed-admin", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const allUsers = await storage.getAllUsers();
      const owners = allUsers.filter((u) => u.role === "owner");

      if (owners.length === 0) {
        const admins = allUsers.filter((u) => u.role === "admin");
        if (admins.length === 0) {
          const updated = await storage.updateUserRole(userId, "owner");
          return res.json({ message: "You are now owner", user: updated });
        }
      }

      res.json({ message: "Owner already exists" });
    } catch (error) {
      res.status(500).json({ message: "Failed to seed admin" });
    }
  });

  return httpServer;
}
