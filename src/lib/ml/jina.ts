import { CLASSES, COLORS } from "@/lib/taxonomy";

const ENDPOINT = "https://api.jina.ai/v1/embeddings";
export const JINA_MODEL = "jina-clip-v2";
const DIMENSIONS = 512;

/** True when an API key is set, so photos are turned into vectors by Jina instead of a model running inside the server. */
export const jinaEnabled = () => Boolean(process.env.JINA_API_KEY);

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

async function embed(input: ({ text: string } | { image: string })[]): Promise<number[][]> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.JINA_API_KEY}` },
    body: JSON.stringify({ model: JINA_MODEL, dimensions: DIMENSIONS, normalized: true, embedding_type: "float", input }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Jina could not make the image vector (${res.status}): ${(await res.text()).slice(0, 160)}`);
  const body = (await res.json()) as { data: { index: number; embedding: number[] }[] };
  return body.data.sort((a, b) => a.index - b.index).map((d) => normalize(d.embedding));
}

export async function jinaImage(blob: Blob): Promise<number[]> {
  return (await embed([{ image: Buffer.from(await blob.arrayBuffer()).toString("base64") }]))[0];
}

export function jinaTexts(texts: string[]): Promise<number[][]> {
  return embed(texts.map((text) => ({ text })));
}

let labels: Promise<{ classEmbeds: number[][]; colorEmbeds: number[][] }> | null = null;

/** The vectors of the product classes and colours, made once per server. */
export function jinaLabels() {
  labels ??= Promise.all([
    jinaTexts(CLASSES.map((c) => `a photo of ${c.prompt}`)),
    jinaTexts(COLORS.map((c) => `a photo of a ${c.name.toLowerCase()} colored product`)),
  ])
    .then(([classEmbeds, colorEmbeds]) => ({ classEmbeds, colorEmbeds }))
    .catch((err) => {
      labels = null;
      throw err;
    });
  return labels;
}
