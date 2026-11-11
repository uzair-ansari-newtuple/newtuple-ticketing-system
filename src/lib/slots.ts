import { BadgeInfo, FlipHorizontal, Scan, SquarePlus, Tag, type LucideIcon } from "lucide-react";
import type { PhotoSlot } from "@/lib/types";

export const SLOTS: { key: PhotoSlot; label: string; hint: string; icon: LucideIcon }[] = [
  { key: "front", label: "Front", hint: "Fill the frame. Lay the item flat or hang it straight.", icon: Scan },
  { key: "back", label: "Back", hint: "Capture the full reverse of the item.", icon: FlipHorizontal },
  { key: "tag", label: "Tag", hint: "Get close. Barcode and price text must be sharp.", icon: Tag },
  { key: "label", label: "Markings", hint: "Show the care label or brand label clearly.", icon: BadgeInfo },
  { key: "other", label: "Extra", hint: "Any extra angle that helps identify the item.", icon: SquarePlus },
];

export const MAX_PHOTOS = SLOTS.length;
