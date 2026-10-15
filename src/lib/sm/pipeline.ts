import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/db";
import { smEnabled, smFetch } from "@/lib/sm/client";
import type { PipelineStatus } from "@/lib/types";

const STEP_TRIGGERS = [
  { from: "CAPTURED", trigger: "to_image_mapped", label: "Continue: map the item details" },
  { from: "IMAGE_MAPPED", trigger: "to_ai_identification", label: "Continue: find matching products" },
  { from: "AI_IDENTIFICATION", trigger: "ai_identification_to_new", label: "Continue: create the ticket" },
] as const;

const DONE_MARKER: Record<string, string> = { CAPTURED: "analyze", IMAGE_MAPPED: "map", AI_IDENTIFICATION: "identify" };

export const stepModeOn = () => process.env.SM_STEP_MODE === "true";

interface Row {
  number: number;
  sm_entity_id: string | null;
  pipeline: Record<string, string>;
  current_state: string;
}

async function loadRow(id: string): Promise<Row | null> {
  const { rows } = await getPool().query<Row>(`SELECT number, sm_entity_id, pipeline, current_state FROM incidents WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/** Where a ticket is in the State Machine's capture pipeline, and what each stage produced so far. */
export async function readPipeline(id: string): Promise<PipelineStatus | null> {
  const row = await loadRow(id);
  if (!row) return null;
  const empty = { state: "CAPTURED", step_mode: stepModeOn(), stage_done: false, next: null, ready: false, summary: { ocr_text: "", brand: "", department: "", gating_tier: "", candidate_count: 0 } };
  if (!smEnabled() || !row.sm_entity_id) return empty;

  const [{ current_state }, record] = await Promise.all([
    smFetch<{ current_state: string }>("GET", `/entities/${row.sm_entity_id}/transitions/available`),
    smFetch<{ data: Record<string, unknown> }>("GET", `/entity-records/${row.sm_entity_id}`),
  ]);
  const data = record.data;
  const stageDone = Boolean(row.pipeline[DONE_MARKER[current_state]]);
  const step = STEP_TRIGGERS.find((s) => s.from === current_state);
  return {
    state: current_state,
    step_mode: stepModeOn(),
    stage_done: stageDone,
    next: stepModeOn() && stageDone && step ? { trigger: step.trigger, label: step.label } : null,
    ready: current_state !== "CAPTURED" && current_state !== "IMAGE_MAPPED" && current_state !== "AI_IDENTIFICATION",
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
  const row = await loadRow(id);
  if (!row?.sm_entity_id) return { status: 409, detail: "The ticket is still being registered. Try again in a moment." };
  const { current_state } = await smFetch<{ current_state: string }>("GET", `/entities/${row.sm_entity_id}/transitions/available`);
  if (current_state !== step.from) return { status: 409, detail: `The ticket is in ${current_state}, not ${step.from}` };
  if (!row.pipeline[DONE_MARKER[step.from]]) return { status: 409, detail: "This step is still running" };
  const result = await smFetch<{ to_state: string }>("POST", `/entities/${row.sm_entity_id}/transitions`, { entity_id: row.sm_entity_id, trigger, idempotency_key: randomUUID(), inputs: {} });
  return { status: 200, state: result.to_state };
}
