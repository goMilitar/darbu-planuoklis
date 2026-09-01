export interface TaskBenchmark {
  category: string;
  subType: string;
  minQty: number;
  maxQty: number;
  unit: string;
}

export const TASK_BENCHMARKS: TaskBenchmark[] = [
  { category: "No prep needed - Level 1", subType: "Surplus Inbound Re-stock", minQty: 500, maxQty: 700, unit: "vnt" },
  { category: "No prep needed - Level 2", subType: "Surplus Inbound Re-stock", minQty: 400, maxQty: 600, unit: "vnt" },
  { category: "Accessories (Cap/belt etc)", subType: "Surplus Inbound Re-stock", minQty: 400, maxQty: 500, unit: "vnt" },
  { category: "Parka/jacket", subType: "Surplus Inbound Re-stock", minQty: 250, maxQty: 350, unit: "vnt" },
  { category: "Coat", subType: "Surplus Inbound Re-stock", minQty: 200, maxQty: 300, unit: "vnt" },
  { category: "Pants", subType: "Surplus Inbound Re-stock", minQty: 200, maxQty: 300, unit: "vnt" },
  { category: "Coverall", subType: "Surplus Inbound Re-stock", minQty: 250, maxQty: 350, unit: "vnt" },
  { category: "Boots", subType: "Surplus Inbound Re-stock", minQty: 250, maxQty: 350, unit: "vnt" },
  { category: "Pouch/bag", subType: "Surplus Inbound Re-stock", minQty: 400, maxQty: 500, unit: "vnt" },
  { category: "Backpack", subType: "Surplus Inbound Re-stock", minQty: 350, maxQty: 500, unit: "vnt" },
  { category: "Clothing Other", subType: "Surplus Inbound Re-stock", minQty: 300, maxQty: 500, unit: "vnt" },
  { category: "Clothing Other Level 2", subType: "Surplus Inbound Re-stock", minQty: 100, maxQty: 200, unit: "vnt" },
  { category: "Shirts/T-Shirts", subType: "Surplus Inbound Re-stock", minQty: 300, maxQty: 300, unit: "vnt" },

  { category: "No prep needed - Level 1", subType: "Surplus Inbound New", minQty: 400, maxQty: 600, unit: "vnt" },
  { category: "No prep needed - Level 2", subType: "Surplus Inbound New", minQty: 300, maxQty: 400, unit: "vnt" },
  { category: "Accessories (Cap/belt etc)", subType: "Surplus Inbound New", minQty: 320, maxQty: 500, unit: "vnt" },
  { category: "Parka/jacket", subType: "Surplus Inbound New", minQty: 200, maxQty: 300, unit: "vnt" },
  { category: "Coat", subType: "Surplus Inbound New", minQty: 200, maxQty: 300, unit: "vnt" },
  { category: "Pants", subType: "Surplus Inbound New", minQty: 150, maxQty: 250, unit: "vnt" },
  { category: "Coverall", subType: "Surplus Inbound New", minQty: 150, maxQty: 250, unit: "vnt" },
  { category: "Boots", subType: "Surplus Inbound New", minQty: 150, maxQty: 250, unit: "vnt" },
  { category: "Pouch/bag", subType: "Surplus Inbound New", minQty: 300, maxQty: 400, unit: "vnt" },
  { category: "Backpack", subType: "Surplus Inbound New", minQty: 250, maxQty: 400, unit: "vnt" },
  { category: "Clothing Other", subType: "Surplus Inbound New", minQty: 200, maxQty: 350, unit: "vnt" },
  { category: "Clothing Other Level 2", subType: "Surplus Inbound New", minQty: 80, maxQty: 200, unit: "vnt" },
  { category: "Shirts/T-Shirts", subType: "Surplus Inbound New", minQty: 250, maxQty: 250, unit: "vnt" },

  { category: "Level 1", subType: "Brand inbound AMZ", minQty: 800, maxQty: 1000, unit: "vnt" },
  { category: "Level 2", subType: "Brand inbound AMZ", minQty: 400, maxQty: 500, unit: "vnt" },
  { category: "Level 3", subType: "Brand inbound AMZ", minQty: 300, maxQty: 400, unit: "vnt" },

  { category: "Level 1", subType: "Brand Inbound", minQty: 800, maxQty: 1000, unit: "vnt" },
  { category: "Level 2", subType: "Brand Inbound", minQty: 350, maxQty: 500, unit: "vnt" },

  { category: "Inventorisation", subType: "", minQty: 4.5, maxQty: 4.5, unit: "lentynos" },
  { category: "Order Processing", subType: "", minQty: 150, maxQty: 200, unit: "vnt" },
  { category: "Level 1", subType: "Picking AMZ", minQty: 2000, maxQty: 2000, unit: "vnt" },
  { category: "Level 2", subType: "Picking AMZ", minQty: 600, maxQty: 600, unit: "vnt" },
  { category: "Picking", subType: "", minQty: 530, maxQty: 700, unit: "vnt" },
  { category: "Refill From Pallets", subType: "", minQty: 175, maxQty: 200, unit: "vnt" },
  { category: "Thermo-Packaging", subType: "", minQty: 375, maxQty: 500, unit: "vnt" },
  { category: "Labeling", subType: "", minQty: 1300, maxQty: 1550, unit: "vnt" },
  { category: "Planning", subType: "", minQty: 15, maxQty: 15, unit: "vnt" },
  { category: "Return processing", subType: "", minQty: 70, maxQty: 100, unit: "vnt" },
  { category: "SHIP FBA", subType: "", minQty: 18, maxQty: 18, unit: "dėžės" },
  { category: "Level 1", subType: "SHIP FBA", minQty: 38, maxQty: 38, unit: "dėžės" },
  { category: "Level 2", subType: "SHIP FBA", minQty: 22, maxQty: 22, unit: "dėžės" },

  { category: "Clothing", subType: "Photoshoot", minQty: 35, maxQty: 35, unit: "vnt" },
  { category: "Accessories", subType: "Photoshoot", minQty: 70, maxQty: 70, unit: "vnt" },
  { category: "Clothing Preparing", subType: "", minQty: 35, maxQty: 35, unit: "vnt" },
  { category: "Photo Editing", subType: "", minQty: 8, maxQty: 8, unit: "vnt" },
  { category: "Attributes", subType: "", minQty: 16, maxQty: 16, unit: "vnt" },
];

const benchmarkMap = new Map<string, TaskBenchmark>();
for (const b of TASK_BENCHMARKS) {
  const key = `${b.subType.toLowerCase()}::${b.category.toLowerCase()}`;
  benchmarkMap.set(key, b);
}

function parseTaskParts(taskType: string): { tier1: string; tier2: string; tier3: string } {
  const parts = taskType.split(" > ");
  return {
    tier1: parts[0]?.trim() || "",
    tier2: parts[1]?.trim() || "",
    tier3: parts[2]?.trim() || "",
  };
}

export function getBenchmark(taskType: string): TaskBenchmark | null {
  const { tier1, tier2, tier3 } = parseTaskParts(taskType);
  if (tier2 && tier3) {
    const key = `${tier2.toLowerCase()}::${tier3.toLowerCase()}`;
    return benchmarkMap.get(key) || null;
  }
  if (tier1 && tier2 && !tier3) {
    const key = `${tier1.toLowerCase()}::${tier2.toLowerCase()}`;
    return benchmarkMap.get(key) || null;
  }
  if (tier1 && !tier2 && !tier3) {
    const key = `::${tier1.toLowerCase()}`;
    return benchmarkMap.get(key) || null;
  }
  return null;
}

export interface LinePerformance {
  category: string;
  subType: string;
  actualQty: number;
  benchmark: TaskBenchmark;
  fractionOfNorm: number;
}

export interface DayPerformance {
  lines: LinePerformance[];
  totalFraction: number;
  performancePct: number;
  rating: "excellent" | "good" | "below" | "poor";
  diversityDiscount: number;
  distinctCategories: number;
}

function getDistinctTier1Count(taskLines: { taskType: string }[]): number {
  const tier1Set = new Set<string>();
  for (const line of taskLines) {
    const { tier1 } = parseTaskParts(line.taskType);
    if (tier1 && tier1 !== "Maintain warehouse") {
      tier1Set.add(tier1.toLowerCase());
    }
  }
  return tier1Set.size;
}

export function getDiversityDiscount(distinctCategories: number): number {
  if (distinctCategories >= 5) return 0.10;
  if (distinctCategories >= 3) return 0.05;
  return 0;
}

export function calculateDayPerformance(
  taskLines: { taskType: string; actualQty: number; plannedQty: number; status?: string }[],
  options?: { skipDiversityDiscount?: boolean }
): DayPerformance {
  const lines: LinePerformance[] = [];
  let totalFraction = 0;

  const activeLines = taskLines.filter(l => l.status !== "blocked" && l.status !== "skipped");

  const distinctCount = getDistinctTier1Count(activeLines);
  const discount = options?.skipDiversityDiscount ? 0 : getDiversityDiscount(distinctCount);

  const grouped = new Map<string, { actualQty: number; benchmark: TaskBenchmark | null; isMaintain: boolean }>();
  for (const line of activeLines) {
    const isMaintain = line.taskType === "Maintain warehouse";
    const bm = getBenchmark(line.taskType);
    if (!bm && !isMaintain) continue;
    const key = isMaintain
      ? "__maintain__"
      : bm
        ? `${bm.subType.toLowerCase()}::${bm.category.toLowerCase()}`
        : line.taskType;
    const existing = grouped.get(key);
    if (existing) {
      existing.actualQty += line.actualQty;
    } else {
      grouped.set(key, { actualQty: line.actualQty, benchmark: bm, isMaintain });
    }
  }

  for (const [, { actualQty, benchmark, isMaintain }] of grouped) {
    if (isMaintain) {
      const fraction = actualQty / MAINTAIN_DAILY_NORM;
      lines.push({
        category: "Maintain warehouse",
        subType: "",
        actualQty,
        benchmark: { category: "Maintain warehouse", subType: "", minQty: MAINTAIN_DAILY_NORM, maxQty: MAINTAIN_DAILY_NORM, unit: "min" },
        fractionOfNorm: fraction,
      });
      totalFraction += fraction;
    } else if (benchmark) {
      const adjustedMin = benchmark.minQty * (1 - discount);
      const fraction = actualQty / adjustedMin;
      lines.push({
        category: benchmark.category,
        subType: benchmark.subType,
        actualQty,
        benchmark,
        fractionOfNorm: fraction,
      });
      totalFraction += fraction;
    }
  }

  const performancePct = Math.round(totalFraction * 100);

  let rating: DayPerformance["rating"];
  if (performancePct >= 100) rating = "excellent";
  else if (performancePct >= 80) rating = "good";
  else if (performancePct >= 60) rating = "below";
  else rating = "poor";

  return { lines, totalFraction, performancePct, rating, diversityDiscount: discount, distinctCategories: distinctCount };
}

const WORKDAY_HOURS = 8;
const MAINTAIN_DAILY_NORM = 480;

export interface DayLoad {
  loadPct: number;
  plannedHours: number;
  maxHours: number;
  totalFraction: number;
  diversityDiscount: number;
  distinctCategories: number;
}

export function calculateDayLoad(
  taskLines: { taskType: string; plannedQty: number; status?: string }[],
  options?: { skipDiversityDiscount?: boolean }
): DayLoad {
  let totalFraction = 0;

  const activeLines = taskLines.filter(l => l.status !== "blocked" && l.status !== "skipped");

  const distinctCount = getDistinctTier1Count(activeLines);
  const discount = options?.skipDiversityDiscount ? 0 : getDiversityDiscount(distinctCount);

  const grouped = new Map<string, { plannedQty: number; benchmark: TaskBenchmark | null; isMaintain: boolean }>();
  for (const line of activeLines) {
    const isMaintain = line.taskType === "Maintain warehouse";
    const bm = getBenchmark(line.taskType);
    if (!bm && !isMaintain) continue;

    const key = isMaintain
      ? "__maintain__"
      : bm
        ? `${bm.subType.toLowerCase()}::${bm.category.toLowerCase()}`
        : line.taskType;

    const existing = grouped.get(key);
    if (existing) {
      existing.plannedQty += line.plannedQty;
    } else {
      grouped.set(key, { plannedQty: line.plannedQty, benchmark: bm, isMaintain });
    }
  }

  for (const [, { plannedQty, benchmark, isMaintain }] of grouped) {
    if (isMaintain) {
      totalFraction += plannedQty / MAINTAIN_DAILY_NORM;
    } else if (benchmark) {
      const adjustedMin = benchmark.minQty * (1 - discount);
      totalFraction += plannedQty / adjustedMin;
    }
  }

  const loadPct = Math.round(totalFraction * 100);
  const plannedHours = +(totalFraction * WORKDAY_HOURS).toFixed(1);

  return { loadPct, plannedHours, maxHours: WORKDAY_HOURS, totalFraction, diversityDiscount: discount, distinctCategories: distinctCount };
}
