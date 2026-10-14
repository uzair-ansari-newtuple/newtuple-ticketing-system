export const MIN_ITEM_COUNT = 1;
export const MAX_ITEM_COUNT = 99;

/** The number of items with a missing tag, which is also how many labels print. */
export function parseItemCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_ITEM_COUNT && value <= MAX_ITEM_COUNT ? value : null;
}
