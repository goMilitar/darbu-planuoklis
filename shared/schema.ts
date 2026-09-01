export * from "./models/auth";

import { pgTable, varchar, integer, real, text, timestamp, boolean, date, serial, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

export const dayPlans = pgTable("day_plans", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  employeeId: varchar("employee_id").notNull().references(() => users.id),
  status: varchar("status", { length: 20 }).notNull().default("planned"),
  createdAt: timestamp("created_at").defaultNow(),
  closedAt: timestamp("closed_at"),
  carryoverFromPlanId: integer("carryover_from_plan_id"),
  closeComment: text("close_comment"),
  performanceScore: real("performance_score"),
  workStartedAt: timestamp("work_started_at"),
  workEndedAt: timestamp("work_ended_at"),
});

export const planLines = pgTable("plan_lines", {
  id: serial("id").primaryKey(),
  dayPlanId: integer("day_plan_id").notNull().references(() => dayPlans.id, { onDelete: "cascade" }),
  taskType: varchar("task_type", { length: 100 }).notNull(),
  itemCode: varchar("item_code", { length: 100 }),
  description: text("description"),
  plannedQty: integer("planned_qty").notNull().default(0),
  actualQty: integer("actual_qty").notNull().default(0),
  unit: varchar("unit", { length: 50 }).default("vnt"),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  sortOrder: integer("sort_order").notNull().default(0),
  carryoverParentLineId: integer("carryover_parent_line_id"),
  isCarryover: boolean("is_carryover").notNull().default(false),
  carriedQty: integer("carried_qty").default(0),
  blockReason: text("block_reason"),
  verifiedByAdmin: boolean("verified_by_admin").notNull().default(false),
});

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts").defaultNow(),
  userId: varchar("user_id").references(() => users.id),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: integer("entity_id").notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  payload: jsonb("payload"),
});

export const usersRelations = relations(users, ({ many }) => ({
  dayPlans: many(dayPlans),
}));

export const dayPlansRelations = relations(dayPlans, ({ one, many }) => ({
  employee: one(users, {
    fields: [dayPlans.employeeId],
    references: [users.id],
  }),
  lines: many(planLines),
}));

export const planLinesRelations = relations(planLines, ({ one }) => ({
  dayPlan: one(dayPlans, {
    fields: [planLines.dayPlanId],
    references: [dayPlans.id],
  }),
}));

export const insertDayPlanSchema = createInsertSchema(dayPlans).omit({
  id: true,
  createdAt: true,
  closedAt: true,
});

export const insertPlanLineSchema = createInsertSchema(planLines).omit({
  id: true,
});

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  ts: true,
});

export type DayPlan = typeof dayPlans.$inferSelect;
export type InsertDayPlan = z.infer<typeof insertDayPlanSchema>;
export type PlanLine = typeof planLines.$inferSelect;
export type InsertPlanLine = z.infer<typeof insertPlanLineSchema>;
export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
