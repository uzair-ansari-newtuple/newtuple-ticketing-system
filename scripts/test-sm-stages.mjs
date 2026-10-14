import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

process.loadEnvFile(".env");
const APP = "http://localhost:3000/api";
const KEY = process.env.SM_CONNECTOR_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (path, { method = "POST", headers = {}, body } = {}) => {
  const res = await fetch(APP + path, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(180000) });
  return { s: res.status, b: await res.json().catch(() => null) };
};
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`);
};

const login = await call("/mock/auth/login", { body: { username: process.env.SM_EMAIL, password: process.env.SM_PASSWORD } });
const auth = { authorization: `Bearer ${login.b.access_token}` };

let n = 0;
function photo(path, slot) {
  const buf = Buffer.concat([readFileSync(path), Buffer.from(`${++n}-${Date.now()}`)]);
  const sha = createHash("sha256").update(buf).digest("hex");
  return { client_image_id: `p${n}`, slot, mime_type: "image/jpeg", image_base64: buf.toString("base64"), sha256: sha,
    quality_hint: { blur_score: 80, brightness: 140, width: 1200, height: 1200 },
    capture: { fileName: "t.jpg", source: "uploaded", mimeType: "image/jpeg", originalBytes: buf.length, compressedBytes: buf.length, width: 1200, height: 1200, sha256: sha, capturedAt: null, device: null, orientation: null, gps: null } };
}
async function createTicket(images) {
  const q = await call("/mock/quality-check", { headers: auth, body: { images } });
  for (let i = 0; i < 30; i++) { if ((await call(`/mock/jobs/${q.b.job_id}`, { method: "GET", headers: auth })).b.status === "completed") break; await sleep(500); }
  const analysis = { model: "pending", match: null, top_matches: [], match_threshold: 0.88, classification: null, ocr: null, error: null };
  const c = await call("/mock/incidents", { headers: auth, body: { quality_check_id: q.b.job_id, images, client_analysis: analysis, embeddings: [] } });
  return c.b.incident_id;
}
const stage = (name, id, key = KEY) => call(`/sm/${name}`, { headers: key ? { "x-api-key": key } : {}, body: { incident_id: id } });

console.log("== Security and input checks ==");
check("analyze without a key is rejected", (await stage("analyze", "00000000-0000-4000-8000-000000000000", "")).s === 401);
check("analyze with a wrong key is rejected", (await stage("analyze", "00000000-0000-4000-8000-000000000000", "nope")).s === 401);
check("analyze with a bad id is rejected", (await call("/sm/analyze", { headers: { "x-api-key": KEY }, body: { incident_id: "not-an-id" } })).s === 422);
check("analyze for an unknown ticket is 404", (await stage("analyze", "00000000-0000-4000-8000-000000000000")).s === 404);

console.log("\n== Ticket with a front photo and a tag photo (SKU-1003) ==");
const id = await createTicket([photo("public/catalog/SKU-1003.jpg", "front"), photo("public/catalog/tags/SKU-1003-tag.jpg", "tag")]);
let t = Date.now();
const a = await stage("analyze", id);
console.log(`      analyze took ${Date.now() - t} ms`);
check("analyze succeeds", a.s === 200 && a.b.ok && !a.b.analysis_failed, JSON.stringify(a.b)?.slice(0, 200));
check("analyze reads brand and barcode from the tag", a.b.ocr?.brand === "Harbor & Pine" && a.b.ocr?.barcode === "812345000030", JSON.stringify(a.b.ocr));
check("analyze finds SKU-1003 as the closest image", a.b.image_matches?.[0]?.sku === "SKU-1003", JSON.stringify(a.b.image_matches));
t = Date.now();
const a2 = await stage("analyze", id);
check("analyze is safe to repeat and returns the same result", a2.s === 200 && JSON.stringify(a2.b) === JSON.stringify(a.b) && Date.now() - t < 1500, `${Date.now() - t} ms`);

const m = await stage("map-attributes", id);
check("map-attributes returns brand and department", m.s === 200 && m.b.brand === "Harbor & Pine" && m.b.department === "Tops", JSON.stringify(m.b)?.slice(0, 200));
check("map-attributes returns normalized metadata with the barcode", m.b.extracted_metadata?.Barcode === "812345000030", JSON.stringify(m.b.extracted_metadata));

const i = await stage("identify", id);
check("identify returns candidates with SKU-1003 first by barcode", i.s === 200 && i.b.edw_candidates?.[0]?.sku === "SKU-1003" && i.b.edw_candidates[0].evidence === "barcode", JSON.stringify(i.b)?.slice(0, 300));
check("identify rates the match", ["GREEN", "YELLOW", "RED"].includes(i.b.gating_tier) && i.b.candidate_count === i.b.edw_candidates.length, JSON.stringify(i.b.gating_tier));
const detail = await call(`/mock/incidents/${id}`, { method: "GET", headers: auth });
check("the app sees the ticket as ready to review", detail.b.state === "CANDIDATES_READY" && detail.b.candidates.length === i.b.candidate_count, `${detail.b.state}`);
const i2 = await stage("identify", id);
check("identify is safe to repeat", JSON.stringify(i2.b) === JSON.stringify(i.b));

console.log("\n== Out-of-order call: identify on a fresh ticket runs the earlier stages ==");
const id2 = await createTicket([photo("public/catalog/SKU-1007.jpg", "front")]);
const direct = await stage("identify", id2);
check("identify alone works on an unanalyzed ticket", direct.s === 200 && direct.b.ok && direct.b.edw_candidates[0]?.sku === "SKU-1007", JSON.stringify(direct.b)?.slice(0, 200));

console.log("\n== A photo that matches nothing ==");
const id3 = await createTicket([photo("public/icon-512.png".replace("png", "png"), "front")].map((p) => p));
const none = await stage("identify", id3);
check("an unrelated image still returns a rating and never an error", none.s === 200 && ["GREEN", "YELLOW", "RED"].includes(none.b.gating_tier), JSON.stringify(none.b)?.slice(0, 200));

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
