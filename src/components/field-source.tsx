import { Barcode, ScanText, Sparkles, Library } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { FieldSource } from "@/lib/types";

const META: Record<FieldSource, { label: string; icon: React.ElementType; variant: "default" | "secondary" | "outline" }> = {
  image_match: { label: "Library match", icon: Library, variant: "default" },
  classifier: { label: "Image AI", icon: Sparkles, variant: "secondary" },
  ocr: { label: "Tag text", icon: ScanText, variant: "outline" },
  barcode: { label: "Barcode", icon: Barcode, variant: "default" },
};

export function SourceBadge({ source, confidence }: { source: FieldSource; confidence: number }) {
  const { label, icon: Icon, variant } = META[source];
  return (
    <Badge variant={variant} className="h-5 text-[10px]">
      <Icon /> {label} · {Math.round(confidence * 100)}%
    </Badge>
  );
}
