import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, ChevronRight, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const SURPLUS_TIER3_OPTIONS = [
  "No prep needed - Level 1",
  "No prep needed - Level 2",
  "Accessories (Cap/belt etc)",
  "Parka/jacket",
  "Coat",
  "Pants",
  "Coverall",
  "Boots",
  "Pouch/bag",
  "Backpack",
  "Clothing Other",
  "Clothing Other Level 2",
  "Shirts/T-Shirts",
];

const SURPLUS_TIER2_OPTIONS = [
  "Surplus Inbound Re-stock",
  "Surplus Inbound New",
];

const AMZ_TIER2_OPTIONS = [
  "Level 1",
  "Level 2",
  "Level 3",
];

const AMZ_LEVEL_DESCRIPTIONS: Record<string, string> = {
  "Level 1": "Nereikia prep. Nedideli daiktai (In stock, labels, bin-rack)",
  "Level 2": "Reikia prep (In stock, Packing, labels, bin-rack) arba gabaritiniai produktai (Oversized, need more space)",
  "Level 3": "Thermo-packing (In stock, Packing, labels, bin-rack)",
};

const BRAND_TIER2_OPTIONS = [
  "Level 1",
  "Level 2",
];

const BRAND_LEVEL_DESCRIPTIONS: Record<string, string> = {
  "Level 1": "Inbound, bin-rack",
  "Level 2": "Apranga (Inbound, size chart, bin-rack)",
};

const TASK_DESCRIPTIONS: Record<string, string> = {
  "SHIP FBA": "Planuojamas kiekis nurodomas dėžėmis. Įrašome maksimalų numatomų dėžių kiekį, dieną uždarome pagal tai kiek išsiųsta tą dieną dėžių.",
  "Inventorisation": "Nurodomas numatomas kiekis per lentyną, pvz. 3 vnt. reiškia 3 lentynos (F19, F20, F21 ir pan.). Prie aprašymo nurodome kokios lentynos konkrečiai bus inventorizuojamos.",
  "Picking AMZ": "Picking for Amazon (LW stock) - prekių surinkimas pagal Amazon užsakymus.",
  "Picking": "Picking kaip atskiras procesas surinkinėjant produktus užsakymams. Planuojamą kiekį skaičiuojam kaip orders, ne units.",
  "Thermo-Packaging": "Naudojam šį darbą tik kai kaip atskirą procesą, o ne kaip kito darbo dalį.",
  "Labeling": "Naudojam tik kaip atskirą procesą, o ne kaip kito darbo dalį.",
  "Photoshoot": "Planuojamas kiekis nurodomas pagal prekių kiekį kiek bus fotografuojamas. Clothing = ant manekeno, Accessories = ant stalo.",
  "Clothing Preparing": "Drabužių lyginimas fotosesijai.",
  "Photo Editing": "Planuojamas kiekis pasirenkamas valandomis - 2 vnt. reiškia 2 val. darbo.",
  "Attributes": "Planuojamas kiekis renkamas 1 vnt. = 0.5 val. Aprašyme nurodomi SKU kuriems pildyta.",
  "Maintain warehouse": "Smulkus sandelio darbai. Tvarkos palaikymas, perkrovimas ir kt. Planuojamas kiekis nurodomas minutėmis. Dienos norma: 480 min. (8 val.)",
};

const HIERARCHICAL_TYPES = ["Surplus Inbound", "Brand Inbound", "Brand inbound AMZ", "Picking AMZ", "Photoshoot", "SHIP FBA"];

const PICKING_AMZ_TIER2_OPTIONS = ["Level 1", "Level 2"];

const PICKING_AMZ_LEVEL_DESCRIPTIONS: Record<string, string> = {
  "Level 1": "Smulkmenos",
  "Level 2": "Drabužiai/rack",
};

const SHIP_FBA_TIER2_OPTIONS = ["Level 1", "Level 2"];

const SHIP_FBA_LEVEL_DESCRIPTIONS: Record<string, string> = {
  "Level 1": "Keli SKU per shipment, greit pakuojasi. Arba siunčiasi orig. dėžėm kaip MAXXIS padangos. (norma 38 dėžės)",
  "Level 2": "Standartinis mix shipmentas. (norma 22 dėžės)",
};

const PHOTOSHOOT_TIER2_OPTIONS = ["Clothing", "Accessories"];

interface TaskHierarchy {
  tier1: string;
  tier2: string;
  tier3: string;
}

const TASK_TYPES = [
  "Surplus Inbound",
  "Brand Inbound",
  "Brand inbound AMZ",
  "SHIP FBA",
  "Return processing",
  "Inventorisation",
  "Order Processing",
  "Picking AMZ",
  "Picking",
  "Photoshoot",
  "Clothing Preparing",
  "Photo Editing",
  "Attributes",
  "Maintain warehouse",
  "Refill From Pallets",
  "Thermo-Packaging",
  "Labeling",
];

function parseTaskValue(value: string): TaskHierarchy {
  const parts = value.split(" > ");
  return {
    tier1: parts[0] || "",
    tier2: parts[1] || "",
    tier3: parts[2] || "",
  };
}

function buildTaskValue(h: TaskHierarchy): string {
  if (!h.tier1) return "";
  if (h.tier1 === "Surplus Inbound") {
    let result = h.tier1;
    if (h.tier2) {
      result += " > " + h.tier2;
      if (h.tier3) {
        result += " > " + h.tier3;
      }
    }
    return result;
  }
  if (h.tier1 === "Brand inbound AMZ" || h.tier1 === "Brand Inbound" || h.tier1 === "Picking AMZ" || h.tier1 === "Photoshoot" || h.tier1 === "SHIP FBA") {
    let result = h.tier1;
    if (h.tier2) {
      result += " > " + h.tier2;
    }
    return result;
  }
  return h.tier1;
}

export function TaskCombobox({
  value,
  onChange,
  "data-testid": testId,
}: {
  value: string;
  onChange: (value: string) => void;
  "data-testid"?: string;
}) {
  const parsed = parseTaskValue(value);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(parsed.tier1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearch(parseTaskValue(value).tier1);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = TASK_TYPES.filter((t) =>
    t.toLowerCase().includes(search.toLowerCase())
  );

  const hasSurplus = parsed.tier1 === "Surplus Inbound";
  const hasAmz = parsed.tier1 === "Brand inbound AMZ";
  const hasBrand = parsed.tier1 === "Brand Inbound";
  const hasPickingAmz = parsed.tier1 === "Picking AMZ";
  const hasPhotoshoot = parsed.tier1 === "Photoshoot";
  const hasShipFba = parsed.tier1 === "SHIP FBA";

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="relative">
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Pradėkite rašyti..."
          data-testid={testId}
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
            {filtered.map((task) => (
              <button
                key={task}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground text-left"
                onClick={() => {
                  setSearch(task);
                  setOpen(false);
                  onChange(task);
                }}
                data-testid={`option-task-${task.replace(/\s+/g, "-").toLowerCase()}`}
              >
                {parsed.tier1 === task && <Check className="h-3.5 w-3.5 text-primary" />}
                <span className={parsed.tier1 === task ? "font-medium" : ""}>{task}</span>
                {HIERARCHICAL_TYPES.includes(task) && <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {!hasSurplus && !hasAmz && !hasBrand && !hasPickingAmz && !hasPhotoshoot && !hasShipFba && parsed.tier1 && TASK_DESCRIPTIONS[parsed.tier1] && (
        <TooltipProvider>
          <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            <span>{TASK_DESCRIPTIONS[parsed.tier1]}</span>
          </div>
        </TooltipProvider>
      )}

      {hasSurplus && (
        <div className="space-y-3 pl-3 border-l-2 border-primary/20">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Tipas</Label>
            <Select
              value={parsed.tier2}
              onValueChange={(v) => onChange(buildTaskValue({ ...parsed, tier2: v, tier3: "" }))}
            >
              <SelectTrigger data-testid="select-tier2">
                <SelectValue placeholder="Pasirinkite tipą..." />
              </SelectTrigger>
              <SelectContent>
                {SURPLUS_TIER2_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {parsed.tier2 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Kategorija</Label>
              <Select
                value={parsed.tier3}
                onValueChange={(v) => onChange(buildTaskValue({ ...parsed, tier3: v }))}
              >
                <SelectTrigger data-testid="select-tier3">
                  <SelectValue placeholder="Pasirinkite kategoriją..." />
                </SelectTrigger>
                <SelectContent>
                  {SURPLUS_TIER3_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {hasAmz && (
        <div className="space-y-3 pl-3 border-l-2 border-primary/20">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Lygis</Label>
            <Select
              value={parsed.tier2}
              onValueChange={(v) => onChange(buildTaskValue({ ...parsed, tier2: v }))}
            >
              <SelectTrigger data-testid="select-amz-level">
                <SelectValue placeholder="Pasirinkite lygį..." />
              </SelectTrigger>
              <SelectContent>
                {AMZ_TIER2_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {parsed.tier2 && AMZ_LEVEL_DESCRIPTIONS[parsed.tier2] && (
            <TooltipProvider>
              <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                <span>{AMZ_LEVEL_DESCRIPTIONS[parsed.tier2]}</span>
              </div>
            </TooltipProvider>
          )}
        </div>
      )}

      {hasBrand && (
        <div className="space-y-3 pl-3 border-l-2 border-primary/20">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Lygis</Label>
            <Select
              value={parsed.tier2}
              onValueChange={(v) => onChange(buildTaskValue({ ...parsed, tier2: v }))}
            >
              <SelectTrigger data-testid="select-brand-level">
                <SelectValue placeholder="Pasirinkite lygį..." />
              </SelectTrigger>
              <SelectContent>
                {BRAND_TIER2_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {parsed.tier2 && BRAND_LEVEL_DESCRIPTIONS[parsed.tier2] && (
            <TooltipProvider>
              <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                <span>{BRAND_LEVEL_DESCRIPTIONS[parsed.tier2]}</span>
              </div>
            </TooltipProvider>
          )}
        </div>
      )}

      {hasPickingAmz && (
        <div className="space-y-3 pl-3 border-l-2 border-primary/20">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Lygis</Label>
            <Select
              value={parsed.tier2}
              onValueChange={(v) => onChange(buildTaskValue({ ...parsed, tier2: v }))}
            >
              <SelectTrigger data-testid="select-picking-amz-level">
                <SelectValue placeholder="Pasirinkite lygį..." />
              </SelectTrigger>
              <SelectContent>
                {PICKING_AMZ_TIER2_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {parsed.tier2 && PICKING_AMZ_LEVEL_DESCRIPTIONS[parsed.tier2] && (
            <TooltipProvider>
              <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                <span>{PICKING_AMZ_LEVEL_DESCRIPTIONS[parsed.tier2]}</span>
              </div>
            </TooltipProvider>
          )}
        </div>
      )}

      {hasPhotoshoot && (
        <div className="space-y-3 pl-3 border-l-2 border-primary/20">
          <TooltipProvider>
            <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
              <span>{TASK_DESCRIPTIONS["Photoshoot"]}</span>
            </div>
          </TooltipProvider>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Tipas</Label>
            <Select
              value={parsed.tier2}
              onValueChange={(v) => onChange(buildTaskValue({ ...parsed, tier2: v }))}
            >
              <SelectTrigger data-testid="select-photoshoot-type">
                <SelectValue placeholder="Pasirinkite tipą..." />
              </SelectTrigger>
              <SelectContent>
                {PHOTOSHOOT_TIER2_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {hasShipFba && (
        <div className="space-y-3 pl-3 border-l-2 border-primary/20">
          <TooltipProvider>
            <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
              <span>{TASK_DESCRIPTIONS["SHIP FBA"]}</span>
            </div>
          </TooltipProvider>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Lygis</Label>
            <Select
              value={parsed.tier2}
              onValueChange={(v) => onChange(buildTaskValue({ ...parsed, tier2: v }))}
            >
              <SelectTrigger data-testid="select-ship-fba-level">
                <SelectValue placeholder="Pasirinkite lygį..." />
              </SelectTrigger>
              <SelectContent>
                {SHIP_FBA_TIER2_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {parsed.tier2 && SHIP_FBA_LEVEL_DESCRIPTIONS[parsed.tier2] && (
            <TooltipProvider>
              <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                <span>{SHIP_FBA_LEVEL_DESCRIPTIONS[parsed.tier2]}</span>
              </div>
            </TooltipProvider>
          )}
        </div>
      )}
    </div>
  );
}

export { TASK_TYPES };
