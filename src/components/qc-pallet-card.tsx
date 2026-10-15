"use client";

import { Loader2, Save } from "lucide-react";
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

function Field({ label, value, onChange, disabled, hint }: { label: string; value: string; onChange: (v: string) => void; disabled: boolean; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        inputMode="numeric"
        value={value}
        disabled={disabled}
        placeholder="0"
        onChange={(e) => onChange(digits(e.target.value))}
        className="mt-1 h-11 w-full rounded-xl border bg-background px-3 text-center text-lg font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
      />
      {hint ? <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
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

  const n = (v: string) => (v === "" ? null : Number(v));
  const total = palletTotal({ mdl_actual: n(mdl), full_cases_count: n(cases), partial_units: n(loose), bundles_per_case: null, units_per_bundle: upc.units_per_bundle, is_prepack: false });
  const match = n(cases) !== null && n(mdl) !== null ? matchCount(pallet.expected_units, total) : null;
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
              <Field label="Units per case" value={mdl} onChange={setMdl} disabled={!editable} hint={`PO says ${pallet.mdl_expected}`} />
              <Field label="Full cases" value={cases} onChange={setCases} disabled={!editable} />
              <Field label="Loose units" value={loose} onChange={setLoose} disabled={!editable} />
            </div>
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
