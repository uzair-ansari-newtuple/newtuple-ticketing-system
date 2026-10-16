"use client";

import { AlertTriangle, Camera, Check, CheckCircle2, Loader2, Pause, ScanSearch, ShieldCheck, Sparkles, Ticket, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { EASE, Stagger, StaggerItem, StaggerListItem } from "@/components/motion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { makeThumb } from "@/lib/image";
import { SLOTS } from "@/lib/slots";
import type { ImagePayload, PipelineStatus, QualityCheckResult } from "@/lib/types";
import { useCapture } from "@/store/capture";
import { useSession } from "@/store/session";

type Stage = "quality" | "create" | "pipeline" | "done";

const STAGES: { key: string; label: string; detail: string; icon: React.ElementType }[] = [
  { key: "quality", label: "Quality check", detail: "Checking sharpness, light and resolution", icon: ShieldCheck },
  { key: "create", label: "Create ticket", detail: "Saving the photos and registering the ticket", icon: Ticket },
  { key: "CAPTURED", label: "Captured", detail: "Reading the tag text and finding similar items", icon: Camera },
  { key: "IMAGE_MAPPED", label: "Image mapped", detail: "Brand, department, class, colour and size", icon: ScanSearch },
  { key: "AI_IDENTIFICATION", label: "AI identification", detail: "Searching the catalog for matching products", icon: Sparkles },
  { key: "NEW", label: "Ticket ready", detail: "Matches found. Opening your ticket", icon: CheckCircle2 },
];
const PIPELINE_STATES = ["CAPTURED", "IMAGE_MAPPED", "AI_IDENTIFICATION"];
const FIRST_PIPELINE_STAGE = 2;
const POLL_MS = 1000;
const MAX_POLL_FAILURES = 8;
const GATING_LABEL: Record<string, string> = { GREEN: "best match", YELLOW: "possible match", RED: "too uncertain" };

/** What a pipeline stage produced, shown once it has finished. */
function resultOf(stageKey: string, s: PipelineStatus["summary"]): string | null {
  if (stageKey === "CAPTURED") return s.ocr_text ? `Tag text read: “${s.ocr_text.split("\n")[0]}”` : "No tag text found";
  if (stageKey === "IMAGE_MAPPED") return s.brand || s.department ? [s.brand, s.department].filter(Boolean).join(" · ") : "Item details not found";
  if (stageKey === "AI_IDENTIFICATION") return `${s.candidate_count} possible ${s.candidate_count === 1 ? "match" : "matches"}${s.gating_tier ? ` · ${GATING_LABEL[s.gating_tier] ?? s.gating_tier}` : ""}`;
  return null;
}

export default function ReviewPage() {
  const router = useRouter();
  const started = useRef(false);
  const photos = useCapture((s) => s.photos);
  const reset = useCapture((s) => s.reset);
  const queryClient = useQueryClient();
  const token = useSession((s) => s.token);
  const user = useSession((s) => s.user);

  const [stage, setStage] = useState<Stage>("quality");
  const [progress, setProgress] = useState(0);
  const [quality, setQuality] = useState<QualityCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [incident, setIncident] = useState<{ id: string; number: string } | null>(null);
  const [pipe, setPipe] = useState<PipelineStatus | null>(null);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    if (!token || !user) return;
    if (started.current) return;
    if (photos.length === 0) {
      router.replace("/capture");
      return;
    }
    started.current = true;

    const payload: ImagePayload[] = photos.map((p) => ({
      client_image_id: p.id,
      slot: p.slot,
      capture: p.metadata,
      mime_type: "image/jpeg",
      image_base64: p.base64,
      sha256: p.metadata.sha256,
      quality_hint: { blur_score: p.metadata.blurScore, brightness: p.metadata.brightness, width: p.metadata.width, height: p.metadata.height },
    }));

    (async () => {
      try {
        const qc = await api.runQualityCheck(token, payload, setProgress);
        setQuality(qc);
        if (!qc.can_create_incident) {
          toast.error("Some photos need a retake");
          return;
        }
        setStage("create");
        setProgress(0);
        const created = await api.createIncident(token, { quality_check_id: qc.quality_check_id, images: payload, thumb: await makeThumb(photos[0].dataUrl) });
        setIncident({ id: created.incident_id, number: created.incident_number_display });
        setStage("pipeline");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    })();
  }, [token, user, photos, router, queryClient, attempt]);

  // While photos are being checked and uploaded, the phone's back button is held so the work is not cut off.
  const guard = useRef({ busy: false, incidentId: null as string | null });
  useEffect(() => {
    guard.current = { busy: !error && quality?.can_create_incident !== false && (stage === "quality" || stage === "create"), incidentId: incident?.id ?? null };
  });
  useEffect(() => {
    window.history.pushState({ review: true }, "");
    const onPop = () => {
      const { busy, incidentId } = guard.current;
      if (busy) {
        window.history.pushState({ review: true }, "");
        toast.message("Please wait while your photos are checked");
        return;
      }
      router.replace(incidentId ? `/incident/${incidentId}` : "/capture");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [router]);

  // From here the State Machine moves the ticket. This screen only watches it and offers the next click in step mode.
  useEffect(() => {
    if (stage !== "pipeline" || !incident || !token) return;
    let failures = 0;
    let stopped = false;
    const tick = async () => {
      try {
        const status = await api.getPipeline(token, incident.id);
        if (stopped) return;
        failures = 0;
        setPipe(status);
        if (status.ready) {
          stopped = true;
          setStage("done");
          reset();
          await queryClient.invalidateQueries({ queryKey: ["incidents"] });
          toast.success(`Ticket ${incident.number} created`);
          router.replace(`/incident/${incident.id}`);
        }
      } catch (err) {
        failures++;
        if (failures >= MAX_POLL_FAILURES && !stopped) {
          stopped = true;
          setError(err instanceof Error ? err.message : "Lost contact with the workflow service");
        }
      }
    };
    void tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [stage, incident, token, reset, queryClient, router]);

  async function advance() {
    if (!pipe?.next || !incident || !token) return;
    setAdvancing(true);
    try {
      await api.advancePipeline(token, incident.id, pipe.next.trigger);
      setPipe(await api.getPipeline(token, incident.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not move the ticket on");
    } finally {
      setAdvancing(false);
    }
  }

  function retry() {
    started.current = false;
    setError(null);
    setQuality(null);
    setIncident(null);
    setPipe(null);
    setStage("quality");
    setProgress(0);
    setAttempt((a) => a + 1);
  }

  const pipeIndex = FIRST_PIPELINE_STAGE + Math.max(0, PIPELINE_STATES.indexOf(pipe?.state ?? "CAPTURED"));
  const current = stage === "quality" ? 0 : stage === "create" ? 1 : stage === "pipeline" ? pipeIndex : STAGES.length;
  const waiting = stage === "pipeline" && Boolean(pipe?.stage_done);
  const partial = stage === "pipeline" ? (waiting ? 1 : 0.4) : Math.min(progress, 100) / 100;
  const overall = stage === "done" ? 100 : Math.round(((current + partial) / STAGES.length) * 100);
  const qualityFailed = quality !== null && !quality.can_create_incident;
  const failedPhotos = quality?.images.filter((i) => !i.passed) ?? [];
  const stepMode = pipe?.step_mode ?? false;

  return (
    <AppShell nav={false} title="Processing" subtitle={stepMode ? "Step mode: tap Continue to move the ticket to the next state." : "Your ticket moves through each state by itself."} back="/capture">
      <div className="mb-5 rounded-2xl bg-gradient-to-br from-hero-from to-hero-to p-5 text-white shadow-lg shadow-primary/20">
        <div className="flex items-end justify-between"><p className="text-sm font-medium text-white/80">{error ? "Something went wrong" : qualityFailed ? "Needs a retake" : stage === "done" ? "All done" : `${STAGES[Math.min(current, STAGES.length - 1)].label}${incident ? ` · ${incident.number}` : ""}`}</p><p className="text-3xl font-bold tabular-nums">{overall}%</p></div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${overall}%` }} /></div>
      </div>
      <Stagger>
        <ol className="space-y-3">
          {STAGES.map((s, idx) => {
            const failed = (s.key === "quality" && qualityFailed) || (error !== null && idx === current);
            const done = !failed && idx < current;
            const isCurrent = !failed && !done && idx === current;
            const paused = isCurrent && waiting && stepMode && idx >= FIRST_PIPELINE_STAGE;
            const running = isCurrent && !paused;
            const Icon = s.icon;
            const state = failed ? "failed" : done ? "done" : paused ? "paused" : running ? "running" : "idle";
            const result = pipe && (done || paused) ? resultOf(s.key, pipe.summary) : null;
            return (
              <StaggerListItem key={s.key}>
                <Card className={`transition-all duration-300 ${running || paused ? "ring-2 ring-primary/40" : ""}`}>
                  <CardContent className="flex items-center gap-4">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={state}
                        initial={{ scale: 0.5, opacity: 0, rotate: -30 }}
                        animate={{ scale: 1, opacity: 1, rotate: 0 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 420, damping: 22 }}
                        className={`grid size-11 shrink-0 place-items-center rounded-xl ${state === "failed" ? "bg-destructive/10 text-destructive" : state === "done" ? "bg-success/15 text-success" : state === "paused" ? "bg-warning/15 text-warning" : state === "running" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                      >
                        {state === "failed" ? <X size={20} /> : state === "done" ? <Check size={20} /> : state === "paused" ? <Pause size={20} /> : state === "running" ? <Loader2 size={20} className="animate-spin" /> : <Icon size={20} />}
                      </motion.span>
                    </AnimatePresence>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{s.label}</p>
                      <p className="text-sm text-muted-foreground">{result ?? s.detail}</p>
                      <AnimatePresence>
                        {running && idx < FIRST_PIPELINE_STAGE ? (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-2.5">
                            <Progress value={Math.max(progress, 8)} />
                          </motion.div>
                        ) : null}
                        {paused && pipe?.next ? (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3">
                            <Button size="sm" disabled={advancing} onClick={advance}>
                              {advancing ? <Loader2 className="animate-spin" /> : null} {pipe.next.label}
                            </Button>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  </CardContent>
                </Card>
              </StaggerListItem>
            );
          })}
        </ol>
      </Stagger>

      <AnimatePresence>
        {qualityFailed ? (
          <motion.section key="failed" className="mt-6" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>{failedPhotos.length} photo{failedPhotos.length === 1 ? "" : "s"} need a retake</AlertTitle>
              <AlertDescription>Fix the photos marked in red, then run the check again.</AlertDescription>
            </Alert>
            <Stagger className="mt-4 grid grid-cols-2 gap-3">
              {photos.map((p) => {
                const r = quality.images.find((i) => i.client_image_id === p.id);
                return (
                  <StaggerItem key={p.id} className={`overflow-hidden rounded-2xl border-2 bg-card ${r?.passed ? "border-success/50" : "border-destructive"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.dataUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                    <div className="p-3">
                      <p className="text-sm font-semibold">{SLOTS.find((s) => s.key === p.slot)?.label}</p>
                      <p className={`mt-0.5 text-xs ${r?.passed ? "text-success" : "text-destructive"}`}>{r?.passed ? "Looks good" : r?.failed_description}</p>
                    </div>
                  </StaggerItem>
                );
              })}
            </Stagger>
            <Button render={<Link href="/capture" />} nativeButton={false} size="lg" className="mt-5 w-full">
              Back to retake
            </Button>
          </motion.section>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {error ? (
          <motion.div key="error" className="mt-6" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>{error}</AlertTitle>
              <AlertDescription>You can try again or go back and change your photos.</AlertDescription>
            </Alert>
            <div className="mt-4 flex gap-3">
              <Button size="lg" className="flex-1" onClick={retry}>Try again</Button>
              <Button render={<Link href="/capture" />} nativeButton={false} size="lg" variant="outline" className="flex-1">Back</Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </AppShell>
  );
}
