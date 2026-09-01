import {
  users,
  dayPlans,
  planLines,
  events,
  employeeAbsences,
  type User,
  type UpsertUser,
  type DayPlan,
  type InsertDayPlan,
  type PlanLine,
  type InsertPlanLine,
  type Event,
  type InsertEvent,
  type EmployeeAbsence,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, lt, desc, asc, sql, count, sum, ne, inArray, isNull } from "drizzle-orm";

export interface IStorage {
  getAllUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  updateUserRole(id: string, role: string): Promise<User>;
  updateUserWorkSchedule(id: string, workSchedule: string): Promise<User>;
  updateUserExpectedDailyHours(id: string, expectedDailyHours: number): Promise<User>;

  getDayPlan(id: number): Promise<DayPlan | undefined>;
  getDayPlansByDate(date: string): Promise<(DayPlan & { employee: User })[]>;
  getDayPlanByEmployeeAndDate(employeeId: string, date: string): Promise<DayPlan | undefined>;
  getLatestPlanBefore(employeeId: string, beforeDate: string): Promise<DayPlan | undefined>;
  getDayPlansForEmployee(employeeId: string, startDate?: string, endDate?: string): Promise<DayPlan[]>;
  createDayPlan(plan: InsertDayPlan): Promise<DayPlan>;
  updateDayPlanStatus(id: number, status: string): Promise<DayPlan>;
  closeDayPlan(id: number, closeComment?: string, performanceScore?: number): Promise<DayPlan>;
  deleteDayPlan(id: number): Promise<void>;
  setWorkStartedAt(id: number, ts: Date): Promise<DayPlan | null>;
  setWorkEndedAt(id: number, ts: Date): Promise<DayPlan | null>;
  getOpenClockInsForEmployee(employeeId: string): Promise<DayPlan[]>;
  getOpenClockInsBeforeDate(date: string): Promise<(DayPlan & { employee: User })[]>;
  getOpenClockInsForDate(date: string): Promise<(DayPlan & { employee: User })[]>;
  hasClockOutReminderBeenSent(planId: number): Promise<boolean>;
  getLastReminderFailureAt(planId: number): Promise<Date | null>;
  updateWorkTimes(id: number, updates: { workStartedAt?: Date | null; workEndedAt?: Date | null }): Promise<DayPlan | undefined>;
  resetWorkStartedAt(id: number): Promise<DayPlan | undefined>;

  getPlanLines(dayPlanId: number): Promise<PlanLine[]>;
  getPlanLine(id: number): Promise<PlanLine | undefined>;
  createPlanLine(line: InsertPlanLine): Promise<PlanLine>;
  updatePlanLine(id: number, updates: Partial<PlanLine>): Promise<PlanLine>;
  deletePlanLine(id: number): Promise<void>;
  getCarryoverChildrenFromParent(parentLineId: number): Promise<PlanLine[]>;

  createEvent(event: InsertEvent): Promise<Event>;
  getEvents(entityType?: string, entityId?: number, limit?: number): Promise<Event[]>;

  createEmployee(data: { firstName: string; lastName?: string; email?: string }): Promise<User>;
  deleteUser(id: string): Promise<void>;
  updateUserActive(id: string, isActive: boolean): Promise<User>;

  getUnclosedPlansBeforeDate(date: string): Promise<DayPlan[]>;
  getAbsencesByDate(date: string): Promise<EmployeeAbsence[]>;
  getAbsencesByDateRange(startDate: string, endDate: string, employeeId?: string): Promise<EmployeeAbsence[]>;
  getAbsenceByEmployeeAndDate(employeeId: string, date: string): Promise<EmployeeAbsence | undefined>;
  createAbsence(data: { employeeId: string; date: string; reason: string; createdBy: string }): Promise<EmployeeAbsence>;
  deleteAbsence(id: number): Promise<void>;

  getAnalytics(employeeId?: string, startDate?: string, endDate?: string, taskType?: string): Promise<any>;

  getFlexHours(startDate: string, endDate: string, employeeId?: string): Promise<{
    employeeId: string;
    employeeFirstName: string | null;
    employeeLastName: string | null;
    employeeExpectedDailyHours: number;
    planId: number;
    date: string;
    workStartedAt: Date | null;
    workEndedAt: Date | null;
  }[]>;
}

export class DatabaseStorage implements IStorage {
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(asc(users.firstName));
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async createEmployee(data: { firstName: string; lastName?: string; email?: string; password?: string }): Promise<User> {
    const id = `emp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const [created] = await db
      .insert(users)
      .values({
        id,
        firstName: data.firstName,
        lastName: data.lastName || null,
        email: data.email || null,
        password: data.password || null,
        role: "employee",
      })
      .returning();
    return created;
  }

  async deleteUser(id: string): Promise<void> {
    const userPlans = await db.select({ id: dayPlans.id }).from(dayPlans).where(eq(dayPlans.employeeId, id));
    if (userPlans.length > 0) {
      const planIds = userPlans.map(p => p.id);
      await db.delete(planLines).where(inArray(planLines.dayPlanId, planIds));
      await db.delete(dayPlans).where(eq(dayPlans.employeeId, id));
    }
    await db.delete(events).where(eq(events.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }

  async updateUserActive(id: string, isActive: boolean): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getUnclosedPlansBeforeDate(date: string): Promise<DayPlan[]> {
    return await db
      .select()
      .from(dayPlans)
      .where(
        and(
          lte(dayPlans.date, (() => {
            const d = new Date(date);
            d.setDate(d.getDate() - 1);
            return d.toISOString().split("T")[0];
          })()),
          ne(dayPlans.status, "closed")
        )
      )
      .orderBy(desc(dayPlans.date));
  }

  async getAbsencesByDate(date: string): Promise<EmployeeAbsence[]> {
    return await db
      .select()
      .from(employeeAbsences)
      .where(eq(employeeAbsences.date, date));
  }

  async getAbsencesByDateRange(startDate: string, endDate: string, employeeId?: string): Promise<EmployeeAbsence[]> {
    const conditions = [
      gte(employeeAbsences.date, startDate),
      lte(employeeAbsences.date, endDate),
    ];
    if (employeeId) conditions.push(eq(employeeAbsences.employeeId, employeeId));
    return await db
      .select()
      .from(employeeAbsences)
      .where(and(...conditions))
      .orderBy(desc(employeeAbsences.date));
  }

  async getAbsenceByEmployeeAndDate(employeeId: string, date: string): Promise<EmployeeAbsence | undefined> {
    const [absence] = await db
      .select()
      .from(employeeAbsences)
      .where(and(eq(employeeAbsences.employeeId, employeeId), eq(employeeAbsences.date, date)));
    return absence || undefined;
  }

  async createAbsence(data: { employeeId: string; date: string; reason: string; createdBy: string }): Promise<EmployeeAbsence> {
    const [created] = await db
      .insert(employeeAbsences)
      .values(data)
      .returning();
    return created;
  }

  async deleteAbsence(id: number): Promise<void> {
    await db.delete(employeeAbsences).where(eq(employeeAbsences.id, id));
  }

  async updateUserRole(id: string, role: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserWorkSchedule(id: string, workSchedule: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ workSchedule, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserExpectedDailyHours(id: string, expectedDailyHours: number): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ expectedDailyHours, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getDayPlan(id: number): Promise<DayPlan | undefined> {
    const [plan] = await db.select().from(dayPlans).where(eq(dayPlans.id, id));
    return plan || undefined;
  }

  async getDayPlansByDate(date: string): Promise<(DayPlan & { employee: User })[]> {
    const result = await db
      .select()
      .from(dayPlans)
      .innerJoin(users, eq(dayPlans.employeeId, users.id))
      .where(eq(dayPlans.date, date))
      .orderBy(asc(users.firstName));

    return result.map((r) => ({
      ...r.day_plans,
      employee: r.users,
    }));
  }

  async getDayPlanByEmployeeAndDate(employeeId: string, date: string): Promise<DayPlan | undefined> {
    const [plan] = await db
      .select()
      .from(dayPlans)
      .where(and(eq(dayPlans.employeeId, employeeId), eq(dayPlans.date, date)));
    return plan || undefined;
  }

  async getLatestPlanBefore(employeeId: string, beforeDate: string): Promise<DayPlan | undefined> {
    const [plan] = await db
      .select()
      .from(dayPlans)
      .where(and(
        eq(dayPlans.employeeId, employeeId),
        lt(dayPlans.date, beforeDate),
      ))
      .orderBy(desc(dayPlans.date))
      .limit(1);
    return plan || undefined;
  }

  async getDayPlansForEmployee(employeeId: string, startDate?: string, endDate?: string): Promise<DayPlan[]> {
    const conditions = [eq(dayPlans.employeeId, employeeId)];
    if (startDate) conditions.push(gte(dayPlans.date, startDate));
    if (endDate) conditions.push(lte(dayPlans.date, endDate));

    return await db
      .select()
      .from(dayPlans)
      .where(and(...conditions))
      .orderBy(desc(dayPlans.date));
  }

  async createDayPlan(plan: InsertDayPlan): Promise<DayPlan> {
    const [created] = await db.insert(dayPlans).values(plan).returning();
    return created;
  }

  async updateDayPlanStatus(id: number, status: string): Promise<DayPlan> {
    const [updated] = await db
      .update(dayPlans)
      .set({ status })
      .where(eq(dayPlans.id, id))
      .returning();
    return updated;
  }

  async closeDayPlan(id: number, closeComment?: string, performanceScore?: number): Promise<DayPlan> {
    const [updated] = await db
      .update(dayPlans)
      .set({
        status: "closed",
        closedAt: new Date(),
        closeComment: closeComment || null,
        performanceScore: performanceScore ?? null,
      })
      .where(eq(dayPlans.id, id))
      .returning();
    return updated;
  }

  async deleteDayPlan(id: number): Promise<void> {
    await db.delete(planLines).where(eq(planLines.dayPlanId, id));
    await db.delete(dayPlans).where(eq(dayPlans.id, id));
  }

  async setWorkStartedAt(id: number, ts: Date): Promise<DayPlan | null> {
    const [updated] = await db
      .update(dayPlans)
      .set({ workStartedAt: ts })
      .where(and(eq(dayPlans.id, id), isNull(dayPlans.workStartedAt)))
      .returning();
    return updated ?? null;
  }

  async setWorkEndedAt(id: number, ts: Date): Promise<DayPlan | null> {
    const [updated] = await db
      .update(dayPlans)
      .set({ workEndedAt: ts })
      .where(and(eq(dayPlans.id, id), isNull(dayPlans.workEndedAt)))
      .returning();
    return updated ?? null;
  }

  async getOpenClockInsForEmployee(employeeId: string): Promise<DayPlan[]> {
    return await db
      .select()
      .from(dayPlans)
      .where(
        and(
          eq(dayPlans.employeeId, employeeId),
          sql`${dayPlans.workStartedAt} IS NOT NULL`,
          isNull(dayPlans.workEndedAt),
          ne(dayPlans.status, "closed"),
        ),
      )
      .orderBy(desc(dayPlans.date));
  }

  async getOpenClockInsBeforeDate(date: string): Promise<(DayPlan & { employee: User })[]> {
    const result = await db
      .select()
      .from(dayPlans)
      .innerJoin(users, eq(dayPlans.employeeId, users.id))
      .where(
        and(
          lt(dayPlans.date, date),
          sql`${dayPlans.workStartedAt} IS NOT NULL`,
          isNull(dayPlans.workEndedAt),
          ne(dayPlans.status, "closed"),
          eq(users.workSchedule, "flex"),
        ),
      )
      .orderBy(desc(dayPlans.date));
    return result.map((r) => ({ ...r.day_plans, employee: r.users }));
  }

  async getOpenClockInsForDate(date: string): Promise<(DayPlan & { employee: User })[]> {
    const result = await db
      .select()
      .from(dayPlans)
      .innerJoin(users, eq(dayPlans.employeeId, users.id))
      .where(
        and(
          eq(dayPlans.date, date),
          sql`${dayPlans.workStartedAt} IS NOT NULL`,
          isNull(dayPlans.workEndedAt),
          ne(dayPlans.status, "closed"),
          eq(users.workSchedule, "flex"),
        ),
      );
    return result.map((r) => ({ ...r.day_plans, employee: r.users }));
  }

  async hasClockOutReminderBeenSent(planId: number): Promise<boolean> {
    const [row] = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.entityType, "day_plan"),
          eq(events.entityId, planId),
          eq(events.action, "clock_out_reminder_sent"),
        ),
      )
      .limit(1);
    return !!row;
  }

  async getLastReminderFailureAt(planId: number): Promise<Date | null> {
    const [row] = await db
      .select({ ts: events.ts })
      .from(events)
      .where(
        and(
          eq(events.entityType, "day_plan"),
          eq(events.entityId, planId),
          eq(events.action, "clock_out_reminder_failed"),
        ),
      )
      .orderBy(desc(events.ts))
      .limit(1);
    return row?.ts ?? null;
  }

  async updateWorkTimes(
    id: number,
    updates: { workStartedAt?: Date | null; workEndedAt?: Date | null },
  ): Promise<DayPlan | undefined> {
    const set: Partial<typeof dayPlans.$inferInsert> = {};
    if (Object.prototype.hasOwnProperty.call(updates, "workStartedAt")) {
      set.workStartedAt = updates.workStartedAt ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "workEndedAt")) {
      set.workEndedAt = updates.workEndedAt ?? null;
    }
    if (Object.keys(set).length === 0) {
      return await this.getDayPlan(id);
    }
    const [updated] = await db
      .update(dayPlans)
      .set(set)
      .where(eq(dayPlans.id, id))
      .returning();
    return updated || undefined;
  }

  async resetWorkStartedAt(id: number): Promise<DayPlan | undefined> {
    const [updated] = await db
      .update(dayPlans)
      .set({ workStartedAt: null })
      .where(and(eq(dayPlans.id, id), isNull(dayPlans.workEndedAt)))
      .returning();
    return updated || undefined;
  }

  async getPlanLines(dayPlanId: number): Promise<PlanLine[]> {
    return await db
      .select()
      .from(planLines)
      .where(eq(planLines.dayPlanId, dayPlanId))
      .orderBy(asc(planLines.sortOrder), asc(planLines.id));
  }

  async getPlanLine(id: number): Promise<PlanLine | undefined> {
    const [line] = await db.select().from(planLines).where(eq(planLines.id, id));
    return line || undefined;
  }

  async createPlanLine(line: InsertPlanLine): Promise<PlanLine> {
    const [created] = await db.insert(planLines).values(line).returning();
    return created;
  }

  async updatePlanLine(id: number, updates: Partial<PlanLine>): Promise<PlanLine> {
    const [updated] = await db
      .update(planLines)
      .set(updates)
      .where(eq(planLines.id, id))
      .returning();
    return updated;
  }

  async deletePlanLine(id: number): Promise<void> {
    await db.delete(planLines).where(eq(planLines.id, id));
  }

  async getCarryoverChildrenFromParent(parentLineId: number): Promise<PlanLine[]> {
    return await db
      .select()
      .from(planLines)
      .where(eq(planLines.carryoverParentLineId, parentLineId));
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    const [created] = await db.insert(events).values(event).returning();
    return created;
  }

  async getEvents(entityType?: string, entityId?: number, limit: number = 50): Promise<Event[]> {
    const conditions = [];
    if (entityType) conditions.push(eq(events.entityType, entityType));
    if (entityId) conditions.push(eq(events.entityId, entityId));

    const query = db.select().from(events);

    if (conditions.length > 0) {
      return await query
        .where(and(...conditions))
        .orderBy(desc(events.ts))
        .limit(limit);
    }

    return await query.orderBy(desc(events.ts)).limit(limit);
  }

  async getAnalytics(employeeId?: string, startDate?: string, endDate?: string, taskType?: string): Promise<any> {
    const conditions = [];
    if (employeeId) conditions.push(eq(dayPlans.employeeId, employeeId));
    if (startDate) conditions.push(gte(dayPlans.date, startDate));
    if (endDate) conditions.push(lte(dayPlans.date, endDate));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const plansWithLines = await db
      .select({
        planId: dayPlans.id,
        planDate: dayPlans.date,
        planStatus: dayPlans.status,
        performanceScore: dayPlans.performanceScore,
        workStartedAt: dayPlans.workStartedAt,
        workEndedAt: dayPlans.workEndedAt,
        employeeId: dayPlans.employeeId,
        employeeFirstName: users.firstName,
        employeeLastName: users.lastName,
        employeeWorkSchedule: users.workSchedule,
        lineId: planLines.id,
        plannedQty: planLines.plannedQty,
        actualQty: planLines.actualQty,
        lineStatus: planLines.status,
        isCarryover: planLines.isCarryover,
        carriedQty: planLines.carriedQty,
        taskType: planLines.taskType,
        itemCode: planLines.itemCode,
      })
      .from(dayPlans)
      .innerJoin(users, eq(dayPlans.employeeId, users.id))
      .leftJoin(planLines, eq(dayPlans.id, planLines.dayPlanId))
      .where(whereClause)
      .orderBy(desc(dayPlans.date));

    const byEmployee: Record<string, any> = {};
    const byDate: Record<string, any> = {};
    const byTaskType: Record<string, any> = {};

    for (const row of plansWithLines) {
      if (taskType && row.taskType && !row.taskType.toLowerCase().includes(taskType.toLowerCase())) {
        continue;
      }

      const empKey = row.employeeId;
      if (!byEmployee[empKey]) {
        byEmployee[empKey] = {
          employeeId: row.employeeId,
          employeeName: `${row.employeeFirstName || ""} ${row.employeeLastName || ""}`.trim(),
          workSchedule: row.employeeWorkSchedule || "full_time",
          totalPlanned: 0,
          totalActual: 0,
          totalCarryoverIn: 0,
          totalCarryoverOut: 0,
          planCount: 0,
          completedPlans: 0,
          closedPlans: 0,
          daysUnderNorm: 0,
          planDates: new Set<string>(),
          underNormDates: new Set<string>(),
        };
      }

      const dateKey = row.planDate;
      if (!byDate[dateKey]) {
        byDate[dateKey] = {
          date: dateKey,
          totalPlanned: 0,
          totalActual: 0,
          totalCarryoverIn: 0,
          totalCarryoverOut: 0,
          planCount: 0,
          employees: new Set(),
        };
      }

      if (row.lineId) {
        const planned = row.plannedQty || 0;
        const actual = Math.min(row.actualQty || 0, planned);
        const undone = Math.max(planned - actual, 0);
        const carryIn = row.isCarryover ? (row.carriedQty || 0) : 0;

        byEmployee[empKey].totalPlanned += planned;
        byEmployee[empKey].totalActual += actual;
        byEmployee[empKey].totalCarryoverIn += carryIn;
        byEmployee[empKey].totalCarryoverOut += undone;

        byDate[dateKey].totalPlanned += planned;
        byDate[dateKey].totalActual += actual;
        byDate[dateKey].totalCarryoverIn += carryIn;
        byDate[dateKey].totalCarryoverOut += undone;

        if (row.taskType) {
          const tier1 = row.taskType.split(" > ")[0];
          if (!byTaskType[tier1]) {
            byTaskType[tier1] = { taskType: tier1, totalPlanned: 0, totalActual: 0, lineCount: 0 };
          }
          byTaskType[tier1].totalPlanned += planned;
          byTaskType[tier1].totalActual += actual;
          byTaskType[tier1].lineCount += 1;
        }
      }

      byDate[dateKey].employees.add(row.employeeId);
    }

    const seenPlans = new Set<number>();
    const planPerformances = new Map<string, Map<number, number | null>>();
    for (const row of plansWithLines) {
      if (seenPlans.has(row.planId)) continue;
      seenPlans.add(row.planId);
      const empId = row.employeeId;
      if (byEmployee[empId]) {
        byEmployee[empId].planCount += 1;
        byEmployee[empId].planDates.add(row.planDate);
        if (row.planStatus === "done") byEmployee[empId].completedPlans += 1;
        if (row.planStatus === "closed") {
          byEmployee[empId].closedPlans += 1;
          if (row.performanceScore !== null && row.performanceScore !== undefined && row.performanceScore < 100) {
            byEmployee[empId].underNormDates.add(row.planDate);
          }
        }
      }
    }

    const employeeStats = Object.values(byEmployee).map((emp: any) => ({
      ...emp,
      completionRate: emp.totalPlanned > 0 ? Math.round((emp.totalActual / emp.totalPlanned) * 100) : 0,
      daysUnderNorm: emp.underNormDates.size,
      totalDays: emp.planDates.size,
      underNormDatesList: Array.from(emp.underNormDates).sort(),
      planDates: undefined,
      underNormDates: undefined,
    }));

    const dateStats = Object.values(byDate).map((d: any) => ({
      ...d,
      employees: d.employees.size,
      completionRate: d.totalPlanned > 0 ? Math.round((d.totalActual / d.totalPlanned) * 100) : 0,
    }));

    const totalPlanned = employeeStats.reduce((s: number, e: any) => s + e.totalPlanned, 0);
    const totalActual = employeeStats.reduce((s: number, e: any) => s + e.totalActual, 0);
    const totalDaysUnderNorm = employeeStats.reduce((s: number, e: any) => s + e.daysUnderNorm, 0);
    const totalDays = employeeStats.reduce((s: number, e: any) => s + e.totalDays, 0);

    const taskTypeStats = Object.values(byTaskType)
      .map((t: any) => ({
        ...t,
        completionRate: t.totalPlanned > 0 ? Math.round((t.totalActual / t.totalPlanned) * 100) : 0,
      }))
      .sort((a: any, b: any) => b.totalPlanned - a.totalPlanned);

    return {
      summary: {
        totalPlanned,
        totalActual,
        completionRate: totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0,
        totalCarryoverIn: employeeStats.reduce((s: number, e: any) => s + e.totalCarryoverIn, 0),
        totalCarryoverOut: employeeStats.reduce((s: number, e: any) => s + e.totalCarryoverOut, 0),
        employeeCount: employeeStats.length,
        planCount: seenPlans.size,
        daysUnderNorm: totalDaysUnderNorm,
        totalDays,
      },
      byEmployee: employeeStats,
      byDate: dateStats.sort((a: any, b: any) => a.date.localeCompare(b.date)),
      byTaskType: taskTypeStats,
    };
  }

  async getFlexHours(startDate: string, endDate: string, employeeId?: string) {
    const conditions = [
      eq(users.workSchedule, "flex"),
      gte(dayPlans.date, startDate),
      lte(dayPlans.date, endDate),
    ];
    if (employeeId) conditions.push(eq(dayPlans.employeeId, employeeId));

    const rows = await db
      .select({
        employeeId: dayPlans.employeeId,
        employeeFirstName: users.firstName,
        employeeLastName: users.lastName,
        employeeExpectedDailyHours: users.expectedDailyHours,
        employeeRole: users.role,
        planId: dayPlans.id,
        date: dayPlans.date,
        workStartedAt: dayPlans.workStartedAt,
        workEndedAt: dayPlans.workEndedAt,
      })
      .from(dayPlans)
      .innerJoin(users, eq(dayPlans.employeeId, users.id))
      .where(and(...conditions))
      .orderBy(asc(users.firstName), asc(dayPlans.date));

    return rows;
  }
}

export const storage = new DatabaseStorage();
