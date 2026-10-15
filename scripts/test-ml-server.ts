import { readFileSync } from "node:fs";
process.loadEnvFile(".env");

async function main() {
  const { analyzeStoredPhotos } = await import("../src/lib/ml/server");
  const products: { sku: string; upc: string; brand: string }[] = JSON.parse(readFileSync("data/products.json", "utf8"));
  const photo = (path: string, slot: "front" | "tag") => ({ slot, mime_type: "image/jpeg", data: readFileSync(path).toString("base64") });
  let failures = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`);
  };

  for (const p of products) {
    const started = Date.now();
    const { analysis } = await analyzeStoredPhotos("ST-112", [photo(`public/catalog/${p.sku}.jpg`, "front")]);
    const top = analysis.top_matches[0];
    check(`${p.sku} front photo matches itself`, !analysis.error && top?.metadata.Sku === p.sku && top.similarity >= 0.95, `${analysis.error ?? `${top?.metadata.Sku} ${top?.similarity?.toFixed(3)}`}`);
    if (p.sku === products[0].sku) console.log(`      first call took ${Date.now() - started} ms (includes model load)`);
  }

  const tagFiles = (await import("node:fs")).readdirSync("public/catalog/tags").filter((f) => f.endsWith(".jpg") || f.endsWith(".png"));
  for (const f of tagFiles.slice(0, 5)) {
    const sku = f.replace(/\..*$/, "").replace(/-tag.*$/, "");
    const p = products.find((x) => x.sku === sku);
    const { analysis } = await analyzeStoredPhotos("ST-112", [photo(`public/catalog/${products[0].sku}.jpg`, "front"), photo(`public/catalog/tags/${f}`, "tag")]);
    const ocr = analysis.ocr;
    if (p) check(`tag ${f}: brand and barcode read`, !!ocr && ocr.brand?.toLowerCase() === p.brand.toLowerCase() && ocr.barcode === p.upc, JSON.stringify({ brand: ocr?.brand, barcode: ocr?.barcode, text: ocr?.text?.slice(0, 80) }));
    else console.log(`      (skipped ${f}: no matching product)`);
  }
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  process.exit(failures ? 1 : 0);
}
main();
