import { isValidGtin, normalizeGtin } from "@/lib/taxonomy";

const FORMATS = ["upc_a", "upc_e", "ean_13", "ean_8", "code_128"];

interface DetectorLike {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>;
}

type NativeDetector = new (options: { formats: string[] }) => DetectorLike;

let detector: Promise<DetectorLike> | null = null;

/** Uses the browser's own BarcodeDetector when it supports our formats, otherwise a WebAssembly one (Safari, Firefox). */
function getDetector(): Promise<DetectorLike> {
  detector ??= (async () => {
    const Native = (globalThis as { BarcodeDetector?: NativeDetector }).BarcodeDetector;
    if (Native) {
      try {
        return new Native({ formats: FORMATS });
      } catch {
        // The native detector does not support these formats here, so fall through to the WebAssembly one.
      }
    }
    const { BarcodeDetector } = await import("barcode-detector/ponyfill");
    return new BarcodeDetector({ formats: FORMATS as never }) as unknown as DetectorLike;
  })();
  return detector;
}

/** Returns the first valid GTIN found in the image or video frame, normalized to UPC-A where possible. */
export async function readBarcode(source: ImageBitmapSource): Promise<string | null> {
  const found = await (await getDetector()).detect(source);
  for (const f of found) {
    const code = normalizeGtin(f.rawValue.replace(/\s/g, ""));
    if (isValidGtin(code)) return code;
  }
  return null;
}
