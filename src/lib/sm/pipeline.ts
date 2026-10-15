import { getRecord, fire, ticketState } from "@/lib/sm/records";
import type { PipelineStatus } from "@/lib/types";

const STEP_TRIGGERS = [
  { from: "CAPTURED", trigger: "to_image_mapped", label: "Continue: map the item details" },
  { from: "IMAGE_MAPPED", trigger: "to_ai_identification", label: "Continue: find matching products" },
  { from: "AI_IDENTIFICATION", trigger: "ai_identification_to_new", label: "Continue: create the ticket" },
] as const;

const DONE_MARKER: Record<string, string> = { CAPTURED: "analyze", IMAGE_MAPPED: "map", AI_IDENTIFICATION: "identify" };

export const stepModeOn = () => process.env.SM_STEP_MODE === "true";

const markers = (value: unknown): Record<string, string> => {
  try {
    return typeof value === "string" && value ? (JSON.parse(value) as Record<string, string>) : {};
  } catch {
    return {};
  }
};

/** Where a ticket is in the State Machine's capture pipeline, and what each stage produced so far. */
export async function readPipeline(id: string): Promise<PipelineStatus | null> {
  const record = await getRecord(id);
  if (!record) return null;
  const { state } = await ticketState(id);
  const data = record.data;
  const stageDone = Boolean(markers(data.pipeline)[DONE_MARKER[state]]);
  const step = STEP_TRIGGERS.find((s) => s.from === state);
  return {
    state,
    step_mode: stepModeOn(),
    stage_done: stageDone,
    next: stepModeOn() && stageDone && step ? { trigger: step.trigger, label: step.label } : null,
    ready: !(state in DONE_MARKER),
    summary: {
      ocr_text: String(data.ocr_text ?? ""),
      brand: String(data.brand ?? ""),
      department: String(data.department ?? ""),
      gating_tier: String(data.gating_tier ?? ""),
      candidate_count: Number(data.candidate_count ?? 0),
    },
  };
}

/** Fires the next pipeline step. Only allowed while the workflow is in step mode. */
export async function advancePipeline(id: string, trigger: string): Promise<{ status: number; detail?: string; state?: string }> {
  if (!stepModeOn()) return { status: 409, detail: "The pipeline runs by itself in this mode" };
  const step = STEP_TRIGGERS.find((s) => s.trigger === trigger);
  if (!step) return { status: 422, detail: "That is not a pipeline step" };
  const record = await getRecord(id);
  if (!record) return { status: 404, detail: "Ticket not found" };
  const { state } = await ticketState(id);
  if (state !== step.from) return { status: 409, detail: `The ticket is in ${state}, not ${step.from}` };
  if (!markers(record.data.pipeline)[DONE_MARKER[step.from]]) return { status: 409, detail: "This step is still running" };
  return { status: 200, state: await fire(id, trigger) };
}
