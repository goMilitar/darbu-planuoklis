import { storage } from "./storage";
import { sendClockOutReminder } from "./gmail";

const LT_TZ_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Vilnius",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const LT_TZ_HOUR = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Vilnius",
  hour: "2-digit",
  hour12: false,
});

function getLocalDateStr(d: Date = new Date()): string {
  return LT_TZ_DATE.format(d);
}

function getLocalHour(d: Date = new Date()): number {
  return parseInt(LT_TZ_HOUR.format(d), 10);
}

const REMINDER_HOUR_LT = 18;
const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const FAILURE_BACKOFF_MS = 6 * 60 * 60 * 1000;

export async function checkForgottenClockOuts(): Promise<{
  considered: number;
  sent: number;
  skipped: number;
}> {
  const now = new Date();
  const todayStr = getLocalDateStr(now);
  const hourLT = getLocalHour(now);

  let considered = 0;
  let sent = 0;
  let skipped = 0;

  try {
    const yesterdayAndOlder = await storage.getOpenClockInsBeforeDate(todayStr);
    const todayOpen = hourLT >= REMINDER_HOUR_LT
      ? await storage.getOpenClockInsForDate(todayStr)
      : [];
    const candidates = [...yesterdayAndOlder, ...todayOpen];
    considered = candidates.length;

    for (const plan of candidates) {
      const employee = plan.employee;
      if (!employee || employee.workSchedule !== "flex") {
        skipped++;
        continue;
      }
      if (!employee.email) {
        skipped++;
        continue;
      }
      const alreadySent = await storage.hasClockOutReminderBeenSent(plan.id);
      if (alreadySent) {
        skipped++;
        continue;
      }
      const lastFailureAt = await storage.getLastReminderFailureAt(plan.id);
      if (
        lastFailureAt &&
        now.getTime() - lastFailureAt.getTime() < FAILURE_BACKOFF_MS
      ) {
        skipped++;
        continue;
      }
      const employeeName =
        `${employee.firstName || ""} ${employee.lastName || ""}`.trim() ||
        employee.email ||
        plan.employeeId;

      const ok = await sendClockOutReminder({
        to: employee.email,
        employeeName,
        date: plan.date,
        workStartedAt: plan.workStartedAt!,
      });

      if (ok) {
        await storage.createEvent({
          userId: plan.employeeId,
          entityType: "day_plan",
          entityId: plan.id,
          action: "clock_out_reminder_sent",
          payload: { to: employee.email, date: plan.date },
        });
        sent++;
      } else {
        await storage.createEvent({
          userId: plan.employeeId,
          entityType: "day_plan",
          entityId: plan.id,
          action: "clock_out_reminder_failed",
          payload: { to: employee.email, date: plan.date },
        });
        skipped++;
      }
    }
  } catch (error) {
    console.error("[scheduler] Error checking forgotten clock-outs:", error);
  }

  if (considered > 0) {
    console.log(
      `[scheduler] Forgotten clock-out check: considered=${considered}, sent=${sent}, skipped=${skipped}`,
    );
  }
  return { considered, sent, skipped };
}

let timer: NodeJS.Timeout | null = null;

export function startReminderScheduler() {
  if (timer) return;
  setTimeout(() => {
    void checkForgottenClockOuts();
  }, 30 * 1000);
  timer = setInterval(() => {
    void checkForgottenClockOuts();
  }, CHECK_INTERVAL_MS);
  console.log(
    `[scheduler] Clock-out reminder scheduler started (every ${CHECK_INTERVAL_MS / 60000} min, end-of-day reminders from ${REMINDER_HOUR_LT}:00 Europe/Vilnius)`,
  );
}
