import { CLASSES, COLORS, emptyMetadata } from "@/lib/taxonomy";
import type { NormalizedMetadata } from "@/lib/types";

export interface Product {
  sku: string;
  upc: string;
  name: string;
  brand: string;
  classCode: string;
  colorCode: string;
  price: string;
}

export const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;
export const productImageUrl = (sku: string) => `/api/mock/products/${sku}/image`;

export function productMetadata(p: Product): NormalizedMetadata {
  const cls = CLASSES.find((c) => c.code === p.classCode);
  const color = COLORS.find((c) => c.code === p.colorCode);
  return {
    ...emptyMetadata(),
    ProductName: p.name,
    Sku: p.sku,
    Price: p.price,
    Brand: p.brand,
    Barcode: p.upc,
    ClassCode: cls?.code ?? null,
    ClassName: cls?.name ?? null,
    DepartmentCode: cls?.departmentCode ?? null,
    DepartmentName: cls?.departmentName ?? null,
    ColorCode: color?.code ?? null,
    ColorName: color?.name ?? null,
  };
}
