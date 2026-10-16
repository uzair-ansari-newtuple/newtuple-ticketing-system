// The Jina calls, checked against a stand-in for the API: what is sent, and that vectors come back normalised and in order.
export {};
process.env.JINA_API_KEY = "test-key";
const { jinaImage, jinaTexts, jinaEnabled, JINA_MODEL } = await import("../src/lib/ml/jina");
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`); };

let sent: { url: string; headers: Record<string, string>; body: { model: string; dimensions: number; input: Record<string, string>[] } } | null = null;
globalThis.fetch = (async (url: string, init: RequestInit) => {
  sent = { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
  const data = sent.body.input.map((_, index) => ({ index, embedding: [3 * (index + 1), 4 * (index + 1)] })).reverse();
  return new Response(JSON.stringify({ data }), { status: 200 });
}) as typeof fetch;

check("a key turns Jina on", jinaEnabled());
const v = await jinaImage(new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }));
check("an image is sent as base64 to the embeddings endpoint", sent!.url === "https://api.jina.ai/v1/embeddings" && sent!.body.input[0].image === Buffer.from([1, 2, 3]).toString("base64"), JSON.stringify(sent));
check("the key and model are sent", sent!.headers.authorization === "Bearer test-key" && sent!.body.model === JINA_MODEL && sent!.body.dimensions === 1024);
check("the vector comes back with length 1", Math.abs(Math.hypot(...v) - 1) < 1e-9 && Math.abs(v[0] - 0.6) < 1e-9, JSON.stringify(v));
const t = await jinaTexts(["a", "b"]);
check("texts are sent as text and come back in order", sent!.body.input[0].text === "a" && t.length === 2 && Math.abs(t[0][0] - 0.6) < 1e-9, JSON.stringify(t));
globalThis.fetch = (async () => new Response("quota", { status: 429 })) as typeof fetch;
check("a refused call says what happened", await jinaImage(new Blob(["x"])).then(() => false, (e: Error) => /429/.test(e.message)));
delete process.env.JINA_API_KEY;
check("no key turns Jina off", !jinaEnabled());
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
