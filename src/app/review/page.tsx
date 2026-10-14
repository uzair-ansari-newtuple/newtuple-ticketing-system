"use client";

import { AlertTriangle, Check, Loader2, ScanSearch, ShieldCheck, Sparkles, Ticket, X } from "lucide-react";
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
import { analyzePhotos } from "@/lib/ml/analysis";
import { SLOTS } from "@/lib/slots";
import type { ImagePayload, QualityCheckResult } from "@/lib/types";
import { useCapture } from "@/store/capture";
import { useSession } from "@/store/session";

type Stage = "quality" | "analyze" | "create" | "extract" | "done";

const STAGES: { key: Stage; label: string; detail: string; icon: React.ElementType }[] = [
  { key: "quality", label: "Quality check", detail: "Checking sharpness, light and resolution", icon: ShieldCheck },
  { key: "analyze", label: "Analyze photos", detail: "Matching against your library and reading the tag", icon: Sparkles },
  { key: "create", label: "Create ticket", detail: "Registering the ticket and uploading photos", icon: Ticket },
  { key: "extract", label: "Read item details", detail: "Extracting brand, size, color and class", icon: ScanSearch },
];

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
  const [stageLabel, setStageLabel] = useState<string | null>(null);
  const [quality, setQuality] = useState<QualityCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

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
      quality_hint: {
        blur_score: p.metadata.blurScore,
        brightness: p.metadata.brightness,
        width: p.metadata.width,
        height: p.metadata.height,
      },
    }));

    (async () => {
      try {
        const qc = await api.runQualityCheck(token, payload, setProgress);
        setQuality(qc);
        if (!qc.can_create_incident) {
          toast.error("Some photos need a retake");
          return;
        }

        setStage("analyze");
        setProgress(0);
        const { analysis, embeddings } = await analyzePhotos({
          photos: photos.map((p) => ({ slot: p.slot, dataUrl: p.dataUrl })),
          token,
          onProgress: (p) => {
            setProgress(p.pct);
            setStageLabel(p.label);
          },
        });
        setStageLabel(null);

        setStage("create");
        const incident = await api.createIncident(
          token,
          { quality_check_id: qc.quality_check_id, images: payload, client_analysis: analysis, embeddings, thumb: await makeThumb(photos[0].dataUrl) },
        );

        setStage("extract");
        setProgress(0);
        await api.waitForExtraction(token, incident.incident_id, (e) => setProgress(e.status === "running" ? 60 : 20));

        setStage("done");
        reset();
        await queryClient.invalidateQueries({ queryKey: ["incidents"] });
        toast.success(`Ticket ${incident.incident_number_display} created`);
        router.replace(`/incident/${incident.incident_id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    })();
  }, [token, user, photos, router, reset, queryClient, attempt]);

  function retry() {
    started.current = false;
    setError(null);
    setQuality(null);
    setStage("quality");
    setProgress(0);
    setStageLabel(null);
    setAttempt((a) => a + 1);
  }

  const order = STAGES.map((s) => s.key);
  const stageIndex = Math.max(0, order.indexOf(stage));
  const overall = stage === "done" ? 100 : Math.round(((stageIndex + Math.min(progress, 100) / 100) / STAGES.length) * 100);
  const qualityFailed = quality !== null && !quality.can_create_incident;
  const failedPhotos = quality?.images.filter((i) => !i.passed) ?? [];

  return (
    <AppShell nav={false} title="Processing" subtitle="The first run downloads the image model, so it takes longer." back="/capture">
      <div className="mb-5 rounded-2xl bg-gradient-to-br from-hero-from to-hero-to p-5 text-white shadow-lg shadow-primary/20">
        <div className="flex items-end justify-between"><p className="text-sm font-medium text-white/80">{error ? "Something went wrong" : qualityFailed ? "Needs a retake" : stage === "done" ? "All done" : STAGES[stageIndex].label}</p><p className="text-3xl font-bold tabular-nums">{overall}%</p></div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${overall}%` }} /></div>
      </div>
      <Stagger>
        <ol className="space-y-3">
          {STAGES.map((s) => {
            const idx = order.indexOf(s.key);
            const current = order.indexOf(stage);
            const failed = (s.key === "quality" && qualityFailed) || (error !== null && idx === current);
            const done = !failed && (idx < current || stage === "done");
            const running = !failed && !done && idx === current;
            const Icon = s.icon;
            const state = failed ? "failed" : done ? "done" : running ? "running" : "idle";
            return (
              <StaggerListItem key={s.key}>
                <Card className={`transition-all duration-300 ${running ? "ring-2 ring-primary/40" : ""}`}>
                  <CardContent className="flex items-center gap-4">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={state}
                        initial={{ scale: 0.5, opacity: 0, rotate: -30 }}
                        animate={{ scale: 1, opacity: 1, rotate: 0 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 420, damping: 22 }}
                        className={`grid size-11 shrink-0 place-items-center rounded-xl ${state === "failed" ? "bg-destructive/10 text-destructive" : state === "done" ? "bg-success/15 text-success" : state === "running" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                      >
                        {state === "failed" ? <X size={20} /> : state === "done" ? <Check size={20} /> : state === "running" ? <Loader2 size={20} className="animate-spin" /> : <Icon size={20} />}
                      </motion.span>
                    </AnimatePresence>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{s.label}</p>
                      <p className="text-sm text-muted-foreground">{running && stageLabel ? stageLabel : s.detail}</p>
                      <AnimatePresence>
                        {running ? (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-2.5">
                            <Progress value={Math.max(progress, 8)} />
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
