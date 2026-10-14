import type { NormalizedMetadata } from "@/lib/types";

export interface ClassDef {
  code: string;
  name: string;
  departmentCode: string;
  departmentName: string;
  prompt: string;
}

export interface ColorDef {
  code: string;
  name: string;
}

export const CLASSES: ClassDef[] = [
  { code: "1001", name: "T-Shirts", departmentCode: "10", departmentName: "Tops", prompt: "a t-shirt" },
  { code: "1002", name: "Shirts", departmentCode: "10", departmentName: "Tops", prompt: "a button-up collared shirt" },
  { code: "1003", name: "Polos", departmentCode: "10", departmentName: "Tops", prompt: "a polo shirt" },
  { code: "1004", name: "Hoodies & Sweatshirts", departmentCode: "10", departmentName: "Tops", prompt: "a hooded sweatshirt" },
  { code: "1005", name: "Sweaters", departmentCode: "10", departmentName: "Tops", prompt: "a knit sweater" },
  { code: "1006", name: "Tank Tops", departmentCode: "10", departmentName: "Tops", prompt: "a sleeveless tank top" },
  { code: "2001", name: "Jeans", departmentCode: "20", departmentName: "Bottoms", prompt: "a pair of denim jeans" },
  { code: "2002", name: "Pants & Chinos", departmentCode: "20", departmentName: "Bottoms", prompt: "a pair of trousers" },
  { code: "2003", name: "Shorts", departmentCode: "20", departmentName: "Bottoms", prompt: "a pair of shorts" },
  { code: "2004", name: "Joggers", departmentCode: "20", departmentName: "Bottoms", prompt: "a pair of jogger sweatpants" },
  { code: "2005", name: "Leggings", departmentCode: "20", departmentName: "Bottoms", prompt: "a pair of leggings" },
  { code: "3001", name: "Dresses", departmentCode: "30", departmentName: "Dresses & Skirts", prompt: "a dress" },
  { code: "3002", name: "Skirts", departmentCode: "30", departmentName: "Dresses & Skirts", prompt: "a skirt" },
  { code: "4001", name: "Jackets", departmentCode: "40", departmentName: "Outerwear", prompt: "a jacket" },
  { code: "4002", name: "Coats & Puffers", departmentCode: "40", departmentName: "Outerwear", prompt: "a winter coat" },
  { code: "5001", name: "Pajamas", departmentCode: "50", departmentName: "Sleepwear", prompt: "a pajama set" },
];

export const COLORS: ColorDef[] = [
  { code: "BLK", name: "Black" },
  { code: "WHT", name: "White" },
  { code: "GRY", name: "Gray" },
  { code: "NVY", name: "Navy" },
  { code: "BLU", name: "Blue" },
  { code: "RED", name: "Red" },
  { code: "MRN", name: "Maroon" },
  { code: "PNK", name: "Pink" },
  { code: "PRP", name: "Purple" },
  { code: "ORG", name: "Orange" },
  { code: "YLW", name: "Yellow" },
  { code: "GRN", name: "Green" },
  { code: "OLV", name: "Olive" },
  { code: "BRN", name: "Brown" },
  { code: "BGE", name: "Beige" },
  { code: "KHK", name: "Khaki" },
];

export const SIZES: { code: string; name: string }[] = [
  { code: "XS", name: "Extra Small" },
  { code: "S", name: "Small" },
  { code: "M", name: "Medium" },
  { code: "L", name: "Large" },
  { code: "XL", name: "Extra Large" },
  { code: "2XL", name: "2X Large" },
  { code: "3XL", name: "3X Large" },
];

const SIZE_PATTERN = /\b(XXXL|3XL|XXL|2XL|XL|XS|S|M|L)\b/;
const NUMERIC_SIZE = /\b(?:SIZE|SZ)[:\s#]*([0-9]{1,2}(?:\.5)?|[0-9]{1,2}T)\b/i;
const PRICE_PATTERN = /\$\s?(\d{1,4}(?:[.,]\d{2})?)/;
const GTIN_LENGTHS = [8, 12, 13, 14];
const SIZE_ALIASES: Record<string, string> = { XXL: "2XL", XXXL: "3XL" };
const NOT_A_BRAND = new Set(["SIZE", "PRICE", "SALE", "NEW", "USA", "MADE", "CHINA", "REG", "ITEM", "STYLE", "COLOR", "QTY", "UPC", "SKU"]);

/** GTIN check digit (UPC-A, EAN-13, EAN-8, GTIN-14). Rejects most OCR misreads. */
export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || !GTIN_LENGTHS.includes(code.length)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop() as number;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Scanners report UPC-A codes as EAN-13 with a leading zero. Catalog UPCs are stored as 12 digits. */
export function normalizeGtin(code: string): string {
  return code.length === 13 && code.startsWith("0") ? code.slice(1) : code;
}

function findBarcode(text: string): string | null {
  for (const line of text.split("\n")) {
    const candidate = line.replace(/[\s-]/g, "");
    if (isValidGtin(candidate)) return candidate;
  }
  const loose = text.match(/\b\d{8,14}\b/g) ?? [];
  return loose.find(isValidGtin) ?? null;
}

/** Reads brand, size, price and barcode out of raw tag text. Brand prefers a known brand, otherwise the most prominent word-like line. */
export function parseTagText(text: string, knownBrands: string[] = []) {
  const upper = text.toUpperCase();
  const compact = upper.replace(/[^A-Z0-9&$ \n]+/g, " ");

  let brand = knownBrands.find((b) => compact.includes(b.toUpperCase())) ?? null;
  if (!brand) {
    const line = text
      .split("\n")
      .map((l) => l.replace(/[^A-Za-z&' ]+/g, " ").replace(/\s+/g, " ").trim())
      .find((l) => l.length >= 3 && /[A-Za-z]{3,}/.test(l) && !NOT_A_BRAND.has(l.toUpperCase()) && l.split(" ").length <= 3);
    brand = line ? line.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/(\w)(\w*)/g, (_, a, b) => a + b.toLowerCase()) : null;
  }

  let size: { code: string; name: string } | null = null;
  const labeled = compact.match(/\bSIZE\s*[:#]?\s*(XXXL|3XL|XXL|2XL|XL|XS|S|M|L)\b/);
  const waist = upper.match(/\b(\d{2})\s?[X/]\s?(\d{2})\b/);
  const alpha = labeled ?? compact.match(SIZE_PATTERN);
  if (waist) {
    const code = `${waist[1]}x${waist[2]}`;
    size = { code, name: `Waist ${waist[1]} · Inseam ${waist[2]}` };
  } else if (alpha) {
    const code = SIZE_ALIASES[alpha[1]] ?? alpha[1];
    size = SIZES.find((s) => s.code === code) ?? { code, name: code };
  } else {
    const numeric = upper.match(NUMERIC_SIZE);
    if (numeric) size = { code: numeric[1], name: `Size ${numeric[1]}` };
  }

  const price = text.match(PRICE_PATTERN);
  return { brand, size, price: price ? `$${price[1]}` : null, barcode: findBarcode(text) };
}

export function emptyMetadata(): NormalizedMetadata {
  return {
    Brand: null,
    ColorCode: null,
    ColorName: null,
    SizeCode: null,
    SizeName: null,
    DepartmentCode: null,
    DepartmentName: null,
    ClassCode: null,
    ClassName: null,
    Barcode: null,
    ProductName: null,
    Sku: null,
    Price: null,
  };
}
