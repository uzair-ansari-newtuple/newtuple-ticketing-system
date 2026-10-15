export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.WARM_UP_ANALYSIS !== "true") return;
  const { warmUp } = await import("@/lib/ml/server");
  warmUp().then(
    () => console.log("[warm-up] image model and OCR are ready"),
    (err) => console.error(`[warm-up] failed: ${err instanceof Error ? err.message : err}`),
  );
}
