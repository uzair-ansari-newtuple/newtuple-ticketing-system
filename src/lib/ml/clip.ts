import { CLASSES, COLORS } from "@/lib/taxonomy";
import { JINA_MODEL, jinaEnabled, jinaImage, jinaLabels } from "./jina";

const MODEL = "Xenova/clip-vit-base-patch32";
const LOGIT_SCALE = 100;

export interface LoadProgress {
  label: string;
  pct: number;
}

type Transformers = typeof import("@huggingface/transformers");

interface ClipRuntime {
  tf: Transformers;
  processor: Awaited<ReturnType<Transformers["AutoProcessor"]["from_pretrained"]>>;
  vision: Awaited<ReturnType<Transformers["CLIPVisionModelWithProjection"]["from_pretrained"]>>;
  classEmbeds: number[][];
  colorEmbeds: number[][];
}

let runtime: Promise<ClipRuntime> | null = null;

export const CLIP_MODEL_NAME = "clip-vit-base-patch32";

/** The model that makes the vectors right now: Jina when an API key is set, otherwise the one that runs inside the server. */
export const embeddingModelName = () => (jinaEnabled() ? JINA_MODEL : CLIP_MODEL_NAME);

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export function meanEmbedding(vectors: number[][]): number[] {
  const out = new Array<number>(vectors[0].length).fill(0);
  for (const v of vectors) for (let i = 0; i < v.length; i++) out[i] += v[i];
  return normalize(out);
}

async function embedTexts(tf: Transformers, texts: string[]): Promise<number[][]> {
  const tokenizer = await tf.AutoTokenizer.from_pretrained(MODEL);
  const textModel = await tf.CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: "q8" });
  const inputs = tokenizer(texts, { padding: true, truncation: true });
  const { text_embeds } = await textModel(inputs);
  const dim = text_embeds.dims[1];
  const data = Array.from(text_embeds.data as Float32Array);
  return texts.map((_, i) => normalize(data.slice(i * dim, (i + 1) * dim)));
}

export function loadClip(onProgress?: (p: LoadProgress) => void): Promise<ClipRuntime> {
  if (process.env.VERCEL) return Promise.reject(new Error("JINA_API_KEY is not set. Add it in the Vercel environment variables and redeploy."));
  runtime ??= (async () => {
    const tf = await import("@huggingface/transformers");
    tf.env.allowLocalModels = false;
    // Vercel only lets a function write to /tmp.
    if (process.env.VERCEL) tf.env.cacheDir = "/tmp/hf-cache";

    const files = new Map<string, number>();
    const progress_callback = (info: { status: string; file?: string; progress?: number }) => {
      if (info.status === "progress" && info.file) {
        files.set(info.file, info.progress ?? 0);
        const pct = [...files.values()].reduce((a, b) => a + b, 0) / Math.max(files.size, 1);
        onProgress?.({ label: "Downloading image model (first run only)", pct });
      }
    };

    const processor = await tf.AutoProcessor.from_pretrained(MODEL, { progress_callback });
    const vision = await tf.CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: "q8", progress_callback });
    onProgress?.({ label: "Preparing categories", pct: 100 });
    const classEmbeds = await embedTexts(tf, CLASSES.map((c) => `a photo of ${c.prompt}`));
    const colorEmbeds = await embedTexts(tf, COLORS.map((c) => `a photo of a ${c.name.toLowerCase()} colored product`));
    return { tf, processor, vision, classEmbeds, colorEmbeds };
  })().catch((err) => {
    runtime = null;
    throw err;
  });
  return runtime;
}

export async function embedImage(source: string | Blob, onProgress?: (p: LoadProgress) => void): Promise<number[]> {
  if (jinaEnabled()) return jinaImage(typeof source === "string" ? await (await fetch(source)).blob() : source);
  const { tf, processor, vision } = await loadClip(onProgress);
  const image = typeof source === "string" ? await tf.RawImage.fromURL(source) : await tf.RawImage.fromBlob(source);
  const inputs = await processor(image);
  const { image_embeds } = await vision(inputs);
  return normalize(Array.from(image_embeds.data as Float32Array));
}

export interface Scored {
  index: number;
  score: number;
}

function softmaxTop(embedding: number[], labels: number[][]): Scored {
  const logits = labels.map((l) => LOGIT_SCALE * dot(embedding, l));
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => e / sum);
  const index = probs.indexOf(Math.max(...probs));
  return { index, score: probs[index] };
}

export async function classifyEmbedding(embedding: number[]) {
  const { classEmbeds, colorEmbeds } = jinaEnabled() ? await jinaLabels() : await loadClip();
  return { cls: softmaxTop(embedding, classEmbeds), color: softmaxTop(embedding, colorEmbeds) };
}
