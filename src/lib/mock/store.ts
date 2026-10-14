export const QUALITY_DURATION_MS = 1800;
export const EXTRACTION_DURATION_MS = 3200;

export function progressFor(elapsed: number, duration: number): number {
  if (elapsed >= duration) return 100;
  const steps = [10, 20, 35, 70, 85];
  return steps[Math.min(steps.length - 1, Math.floor((elapsed / duration) * steps.length))];
}
