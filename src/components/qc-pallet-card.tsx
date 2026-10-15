"use client";

import { Info, Loader2, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PalletBadge } from "@/components/qc-badges";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CHECKS, type CheckKey, type Pallet, type UpcDetail } from "@/lib/qc/dto";
import { matchCount, palletTotal } from "@/lib/qc/match";
import { useQcMutations } from "@/lib/qc/queries";

const GROUPS = [
  { title: "Product", keys: CHECKS.slice(0, 5) },
  { title: "Labels", keys: CHECKS.slice(5) },
] as const;

const digits = (v: string) => v.replace(/\D/g, "");

type Help = "mdl" | "cases" | "loose";

function Field({ label, value, onChange, disabled, hint, active, onInfo }: { label: string; value: string; onChange: (v: string) => void; disabled: boolean; hint?: string; active: boolean; onInfo: () => void }) {
  return (
    <div className="block">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <label htmlFor={label}>{label}</label>
        <button type="button" onClick={onInfo} aria-label={`What is ${label.toLowerCase()}?`} aria-pressed={active} className={`grid size-5 place-items-center rounded-full outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${active ? "bg-primary text-primary-foreground" : "text-primary hover:bg-primary/10"}`}>
          <Info size={14} />
        </button>
      </span>
      <input
        id={label}
        inputMode="numeric"
        value={value}
        disabled={disabled}
        placeholder="0"
        onChange={(e) => onChange(digits(e.target.value))}
        className="mt-1 h-11 w-full rounded-xl border bg-background px-3 text-center text-lg font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
      />
      {hint ? <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

/** One pallet: the product and label checks, then the case counts. The total and the match against the PO are worked out as you type. */
export function PalletCard({ upc, pallet, editable }: { upc: UpcDetail; pallet: Pallet; editable: boolean }) {
  const { pallet: save } = useQcMutations();
  const [checks, setChecks] = useState<Record<CheckKey, boolean>>(pallet.checks);
  const [mdl, setMdl] = useState(pallet.mdl_actual === null ? "" : String(pallet.mdl_actual));
  const [cases, setCases] = useState(pallet.full_cases_count === null ? "" : String(pallet.full_cases_count));
  const [loose, setLoose] = useState(pallet.partial_units === null ? "" : String(pallet.partial_units));
  const [open, setOpen] = useState(pallet.status !== "COMPLETE");
  const [help, setHelp] = useState<Help | null>(null);

  const n = (v: string) => (v === "" ? null : Number(v));
  const total = palletTotal({ mdl_actual: n(mdl), full_cases_count: n(cases), partial_units: n(loose), bundles_per_case: null, units_per_bundle: upc.units_per_bundle, is_prepack: false });
  const match = n(cases) !== null && n(mdl) !== null ? matchCount(pallet.expected_units, total) : null;
  const perCase = pallet.mdl_expected || 12;
  const example = `Example: ${pallet.expected_units} units on this pallet is ${Math.floor(pallet.expected_units / perCase)} full cases of ${perCase}${pallet.expected_units % perCase ? ` plus ${pallet.expected_units % perCase} loose units` : " and no loose units"}.`;
  const EXPLAIN: Record<Help, string> = {
    mdl: `How many units fit in one full case. Open a case and count what is inside it. The PO expects ${pallet.mdl_expected}. If the cases you find hold a different number, type that number instead.`,
    cases: "How many full cases are on this pallet. Count only the cases that are packed with the units-per-case number above. Do not count a case that is only partly filled.",
    loose: "Units that are not in a full case, such as what is left in an opened or partly filled case. Add them all together. Type 0 if there are none.",
  };
  const toggle = (h: Help) => setHelp((cur) => (cur === h ? null : h));
  const ready = CHECKS.every(([key]) => checks[key]) && n(mdl) !== null && n(cases) !== null;

  function submit() {
    save.mutate(
      { upcId: upc.id, palletId: pallet.id, checks, mdl_actual: n(mdl) ?? undefined, full_cases_count: n(cases) ?? undefined, partial_units: n(loose) ?? 0 },
      { onSuccess: () => toast.success(`${pallet.label} saved`), onError: (e) => toast.error(e.message) },
    );
  }

  return (
    <section className="rounded-2xl border bg-card shadow-sm">
      <button className="flex w-full items-center justify-between gap-3 p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <div>
          <p className="font-semibold">{pallet.label}</p>
          <p className="text-xs text-muted-foreground">Expected {pallet.expected_units} units{pallet.total_units ? ` · counted ${pallet.total_units}` : ""}</p>
        </div>
        <PalletBadge status={pallet.status} />
      </button>

      {open ? (
        <div className="space-y-5 border-t p-4">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</h3>
              <ul className="space-y-2">
                {g.keys.map(([key, label]) => (
                  <li key={key}>
                    <label className="flex items-center gap-3 text-sm">
                      <Checkbox checked={checks[key]} disabled={!editable} onCheckedChange={(v) => setChecks((c) => ({ ...c, [key]: Boolean(v) }))} />
                      {label}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Count</h3>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Units per case" value={mdl} onChange={setMdl} disabled={!editable} hint={`PO says ${pallet.mdl_expected}`} active={help === "mdl"} onInfo={() => toggle("mdl")} />
              <Field label="Full cases" value={cases} onChange={setCases} disabled={!editable} active={help === "cases"} onInfo={() => toggle("cases")} />
              <Field label="Loose units" value={loose} onChange={setLoose} disabled={!editable} active={help === "loose"} onInfo={() => toggle("loose")} />
            </div>
            {help ? (
              <div role="note" className="mt-3 rounded-xl bg-primary/8 p-3 text-sm leading-relaxed">
                <p>{EXPLAIN[help]}</p>
                <p className="mt-2 text-xs text-muted-foreground">Total = full cases × units per case + loose units. {example}</p>
              </div>
            ) : null}
            <div className={`mt-3 rounded-xl p-3 text-sm font-medium ${!match ? "bg-muted text-muted-foreground" : match.result === "MATCH" ? "bg-success/12 text-success" : match.result === "SHORT" ? "bg-destructive/10 text-destructive" : "bg-warning/18 text-warning-foreground"}`} aria-live="polite">
              {match ? (match.result === "MATCH" ? `Counts match: ${total} of ${pallet.expected_units}` : `${match.result === "SHORT" ? "Short" : "Over"} by ${match.diff}: ${total} of ${pallet.expected_units}`) : "Enter the case counts to compare with the PO"}
            </div>
          </div>

          {editable ? (
            <Button className="w-full" disabled={save.isPending || (!ready && pallet.status === "PENDING" && !Object.values(checks).some(Boolean) && n(cases) === null)} onClick={submit}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} {ready ? "Save pallet" : "Save progress"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
