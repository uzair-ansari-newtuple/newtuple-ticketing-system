import type { PhotoSlot } from "@/lib/types";

export const SLOTS: { key: PhotoSlot; label: string; hint: string }[] = [
  { key: "front", label: "Front", hint: "Fill the frame. Lay the item flat or hang it straight." },
  { key: "back", label: "Back", hint: "Capture the full reverse of the item." },
  { key: "tag", label: "Tag", hint: "Get close. Barcode and price text must be sharp." },
  { key: "label", label: "Markings", hint: "Show the care label or brand label clearly." },
  { key: "other", label: "Extra", hint: "Any extra angle that helps identify the item." },
];

export const MAX_PHOTOS = SLOTS.length;
