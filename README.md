# Newtuple Ticketing System

A mobile-first PWA for missing price tags in retail apparel. An associate photographs or scans an item, the app finds the product, and prints a replacement barcode tag. Hard cases go to a resolver. Built with Next.js 16, shadcn/ui, with the State Machine as its only data store.

Everything is stored in the State Machine: accounts and roles, tickets and their photos, quality checks, and the product catalog with its photos and image vectors. The app has no database of its own.

## Run it

```bash
npm install
cp .env.example .env        # then fill in the SM_* values
node scripts/sm-data.mjs    # file types, entity types and the catalog workflow in the State Machine
npm run catalog             # products, photos and image vectors
node scripts/sm-dcqc.mjs    # DC QC: the shipment, UPC and pallet entities, their forms, connectors and the DCQC Shipment QC and DCQC UPC QC workflows
npm run dev
```

Sign in as `store112` / `store123` (store associate) or `resolver1` / `resolver123` (resolver desk).

## Deploy to Vercel

1. Import the GitHub repo in Vercel.
2. Add environment variables:
   - the `SM_*` values from `.env.example`.
3. Deploy. The camera and install-to-home-screen need HTTPS, which Vercel provides, so it works on a phone.

Run `node scripts/sm-data.mjs` and `npm run catalog` once against the same State Machine (from your machine) before first use.

## What the app does

- **Photo Match:** capture or upload up to 5 photos, quality check, on-device image analysis, then the best matches from the product list. Green means one clear match, yellow means choose, red is blocked and goes to a resolver.
- **Print tag:** barcode label with price, printer 1 or 2, copies, tag colour reminder, then **Confirm New Tag Added** completes the ticket.
- **Request assistance / resolver desk:** reason codes, item age and note. The resolver claims, then recommends an item, says it can't be resolved, or says it isn't CT merchandise. The store gets the answer in its inbox. Unresolvable items need a disposition (Discard, Return to Vendor, Donate).
- **Inbox:** All, In review, Resolved, Completed, Unresolvable, Unread, with status and priority badges.

## How matching works

1. **Quality check:** sharpness, brightness and resolution are measured on the real photo.
2. **Image embeddings:** a CLIP model (`Xenova/clip-vit-base-patch32`, run in the browser with `@huggingface/transformers`) turns each product photo into a 512-number vector. Tag and label photos are skipped because mostly-white text photos look alike.
3. **Vector search:** the vectors go to Postgres, which finds the nearest catalog items with pgvector (`vector(512)`, HNSW cosine index). 0.88 or more counts as a match.
4. **Candidates and gating:** candidates come from an exact barcode, vector similarity, and matching brand, category and color. Gating is green, yellow or red.
5. **Tag OCR:** `tesseract.js` reads brand, size, price and barcode. Barcodes are checked with the GTIN check digit, so a misread is rejected.

The first run downloads the models (about 90 MB, cached after), so it needs internet once.

## Data and scripts

| Command | What it does |
| --- | --- |
| `npm run catalog` | Loads products from `data/products.json`, their photos from `public/catalog/<SKU>.jpg` and image vectors into the State Machine |
| `python3 scripts/generate-seed-images.py` | Regenerates the sample product illustrations and price-tag images (macOS) |

`public/catalog/tags/` holds sample price-tag images you can upload to try OCR and barcode reading without real tags. The product pictures are generated illustrations. To use real photos, drop `<SKU>.jpg` files into `public/catalog/` and run `npm run catalog`, and edit `data/products.json` for your own products.

## Layout

- `src/app` pages and API routes (`/api/mock/*`)
- `src/components` UI (`ui/` is shadcn), bottom navigation, print panel, barcode
- `src/lib` API client, image processing, EXIF, ML (`ml/`), business rules (`mock/flow.ts`), taxonomy
- `data` product list, `scripts` State Machine setup, catalog loading and tests

## Notes

- The label "printing" records a print job in the database. No physical printer or label service is connected.
- Login tokens are HMAC-signed and expire after 24 hours.
