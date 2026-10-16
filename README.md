# Retail Ops

A mobile-first web app with two workflows: **DC QC**, where distribution center staff check a shipment against its purchase order UPC by UPC, and **Ticketing**, where a store fixes an item that is missing its price tag from a photo. Built with Next.js 16 and shadcn/ui, with the State Machine as its only data store.

Everything is stored in the State Machine: accounts and roles, tickets and their photos, quality checks, and the product catalog with its photos and image vectors. The app has no database of its own.

## Documentation

- [Overview, setup and tests](docs/README.md)
- [DC QC: shipment quality check](docs/dc-qc.md)
- [Ticketing: missing price tags](docs/ticketing.md)

## Run it

```bash
npm install
cp .env.example .env        # then fill in the SM_* values
node scripts/sm-data.mjs    # file types, entity types and the catalog workflow in the State Machine
npm run catalog             # products, photos and image vectors
node scripts/sm-dcqc.mjs    # (run it again after adding users, so the user dropdowns list them) DC QC: the shipment, UPC and pallet entities, their forms, connectors and the DCQC Shipment QC and DCQC UPC QC workflows
npm run dev:api             # backend on port 3001
npm run dev:web             # screens on port 3000
```

Sign in with a State Machine account. Local test accounts are created by `scripts/sm-users.mjs` (their logins go to `LOGINS.txt`, which is not committed). After login you choose **DC QC** or **Ticketing**.

## Deploy to Vercel

1. Import the GitHub repo in Vercel.
2. Add environment variables:
   - the `SM_*` values from `.env.example`.
3. Deploy. The camera and install-to-home-screen need HTTPS, which Vercel provides, so it works on a phone.

Run `node scripts/sm-data.mjs` and `npm run catalog` once against the same State Machine (from your machine) before first use.

## What the app does

- **DC QC** (`/qc`): fetch the shipments that arrived, start QC, then for each UPC check the product, count the pallets with a live match against the PO, add goods and label photos, and approve it or flag a problem for the supervisor. When every UPC is approved or skipped, submit QC; a supervisor then verifies and closes the receipt. See [docs/dc-qc.md](docs/dc-qc.md).
- **Ticketing** (`/`): photograph an item, pass a photo quality check, let the app read the tag and find the product, then print a new tag or ask a resolver for help. Resolvers work the ticket in the State Machine itself and the app follows along. See [docs/ticketing.md](docs/ticketing.md).

## How Ticketing matching works

1. **Quality check:** resolution, sharpness and brightness are measured on the real photo.
2. **Image fingerprints:** a CLIP model (`Xenova/clip-vit-base-patch32`) runs on the server and turns each product photo into a 512-number vector. Tag and label photos are skipped because they show text, not the product.
3. **Vector search:** the catalog's vectors are kept on each catalog record in the State Machine and compared in memory (cosine similarity). 0.88 or more counts as a match.
4. **Candidates and rating:** candidates come from an exact barcode, image similarity, and matching brand, category and colour. The rating is green, yellow or red.
5. **Tag OCR:** `tesseract.js` reads brand, size, price and barcode. Barcodes are checked with the GTIN check digit, so a misread is rejected.

The first run downloads the models (about 90 MB, cached after), so it needs internet once.

## Data and scripts

| Command | What it does |
| --- | --- |
| `npm run catalog` | Loads products from `data/products.json`, their photos from `public/catalog/<SKU>.jpg` and image vectors into the State Machine |
| `python3 scripts/generate-seed-images.py` | Regenerates the sample product illustrations and price-tag images (macOS) |

`public/catalog/tags/` holds sample price-tag images you can upload to try OCR and barcode reading without real tags. The product pictures are generated illustrations. To use real photos, drop `<SKU>.jpg` files into `public/catalog/` and run `npm run catalog`, and edit `data/products.json` for your own products.

## Layout

- `src/app` pages and API routes (`/api/mock/*` for the screens, `/api/sm/*` for connectors)
- `src/components` UI (`ui/` is shadcn), bottom navigation, print panel, barcode
- `src/lib` API client, image processing, EXIF, ML (`ml/`), business rules (`mock/flow.ts`), taxonomy
- `data` product list, `scripts` State Machine setup, catalog loading and tests

## Notes

- Label "printing" records a print job on the ticket. No physical printer or label service is connected.
- Login uses State Machine tokens, which the app refreshes automatically.
- DC QC uses sample shipments built from the catalog; no real PO source is connected yet.
