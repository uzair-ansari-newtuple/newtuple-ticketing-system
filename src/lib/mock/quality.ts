import { randomUUID } from "node:crypto";
import { createRecord, getRecord, putRecord, QUALITY_ENTITY_TYPE } from "@/lib/sm/records";
import type { QualityCheckResult } from "@/lib/types";

export interface QualityRecord {
  id: string;
  store_id: string;
  result: QualityCheckResult;
  consumed: boolean;
  created_at: Date;
}

/** Saves a quality check in the State Machine. Its id is the State Machine's record id. */
export async function saveQuality(storeId: string, result: Omit<QualityCheckResult, "quality_check_id">): Promise<QualityCheckResult> {
  const created = await createRecord(QUALITY_ENTITY_TYPE, { identifier: `qc-${randomUUID()}`, store_id: storeId, result: JSON.stringify(result), consumed: "false", expires_at: result.expires_at });
  return { ...result, quality_check_id: created.id };
}

export async function getQuality(id: string): Promise<QualityRecord | null> {
  const record = await getRecord(id);
  if (!record || typeof record.data.result !== "string") return null;
  return {
    id: record.id,
    store_id: String(record.data.store_id),
    result: { ...(JSON.parse(record.data.result) as Omit<QualityCheckResult, "quality_check_id">), quality_check_id: record.id },
    consumed: record.data.consumed === "true",
    created_at: new Date(record.created_at),
  };
}

/** Marks a quality check as used. Returns false when it was already used. */
export async function consumeQuality(id: string): Promise<boolean> {
  const current = await getQuality(id);
  if (!current || current.consumed) return false;
  await putRecord(id, { consumed: "true" });
  return true;
}

export async function releaseQuality(id: string): Promise<void> {
  await putRecord(id, { consumed: "false" });
}
