"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { processImage } from "@/lib/image";
import { embedImage } from "@/lib/ml/clip";
import { CLASSES, COLORS, isValidGtin, normalizeGtin } from "@/lib/taxonomy";
import { useLibrary } from "@/store/library";
import { useSession } from "@/store/session";

const MAX_PHOTOS = 3;

interface Draft {
  id: string;
  dataUrl: string;
  base64: string;
}

export default function NewProductPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const token = useSession((s) => s.token);
  const refreshLibrary = useLibrary((s) => s.refresh);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Draft[]>([]);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [classCode, setClassCode] = useState("");
  const [colorCode, setColorCode] = useState("");
  const [upc, setUpc] = useState("");
  const [price, setPrice] = useState("");
  const [label, setLabel] = useState("");
  const [progress, setProgress] = useState(0);

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const picked = Array.from(files).slice(0, MAX_PHOTOS - photos.length);
    if (fileRef.current) fileRef.current.value = "";
    try {
      const processed = await Promise.all(picked.map((f) => processImage(f)));
      setPhotos((p) => [...p, ...processed.map((x) => ({ id: crypto.randomUUID(), dataUrl: x.dataUrl, base64: x.base64 }))]);
    } catch {
      toast.error("Could not read that image. Use a JPEG or PNG photo.");
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const embeddings: number[][] = [];
      for (let i = 0; i < photos.length; i++) {
        setLabel(`Analyzing photo ${i + 1} of ${photos.length}`);
        embeddings.push(await embedImage(photos[i].dataUrl, (p) => { setLabel(p.label); setProgress(p.pct); }));
        setProgress(((i + 1) / photos.length) * 100);
      }
      return api.createProduct(token!, {
        name,
        brand,
        upc: normalizeGtin(upc.replace(/\s/g, "")),
        class_code: classCode,
        color_code: colorCode,
        price: Number(price),
        images: photos.map((p) => ({ mime_type: "image/jpeg" as const, image_base64: p.base64 })),
        embeddings,
      });
    },
    onSuccess: async ({ sku }) => {
      toast.success(`${sku} added to the catalog`);
      await Promise.all([qc.invalidateQueries({ queryKey: ["products"] }), refreshLibrary()]);
      router.replace("/library");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upcOk = isValidGtin(normalizeGtin(upc.replace(/\s/g, "")));
  const priceOk = price !== "" && Number(price) >= 0;
  const canSave = photos.length > 0 && name.trim() !== "" && brand.trim() !== "" && classCode !== "" && colorCode !== "" && upcOk && priceOk && !save.isPending;

  return (
    <AppShell
      title="Add product"
      subtitle="Saved to the database with its photos."
      back="/library"
      footer={<Button size="lg" className="w-full" disabled={!canSave} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : null} {save.isPending ? "Saving" : "Save product"}</Button>}
    >
      <Card>
        <CardContent className="space-y-5">
          <div>
            <Label>Photos ({photos.length}/{MAX_PHOTOS})</Label>
            <div className="mt-2 flex gap-3">
              {photos.map((p) => (
                <div key={p.id} className="relative size-20 overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.dataUrl} alt="" className="size-full object-cover" />
                  <button onClick={() => setPhotos((x) => x.filter((i) => i.id !== p.id))} aria-label="Remove photo" className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white"><X size={12} /></button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS ? (
                <button onClick={() => fileRef.current?.click()} className="grid size-20 place-items-center rounded-xl border-2 border-dashed text-muted-foreground transition hover:border-primary hover:text-primary" aria-label="Add photos"><ImagePlus size={22} /></button>
              ) : null}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/heif" multiple capture="environment" hidden onChange={(e) => onFiles(e.target.files)} />
            <p className="mt-2 text-xs text-muted-foreground">Use clear photos of the real item. Different angles match better.</p>
          </div>

          <div className="space-y-2"><Label htmlFor="name">Product name</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Slim Fit Stretch Jeans" className="h-11" /></div>
          <div className="space-y-2"><Label htmlFor="brand">Brand</Label><Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} className="h-11" /></div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={classCode} onValueChange={(v) => setClassCode(v ?? "")} items={CLASSES.map((c) => ({ value: c.code, label: `${c.name} (${c.departmentName})` }))}>
              <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Choose a category" /></SelectTrigger>
              <SelectContent>{CLASSES.map((c) => <SelectItem key={c.code} value={c.code}>{c.name} ({c.departmentName})</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Color</Label>
              <Select value={colorCode} onValueChange={(v) => setColorCode(v ?? "")} items={COLORS.map((c) => ({ value: c.code, label: c.name }))}>
                <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Color" /></SelectTrigger>
                <SelectContent>{COLORS.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label htmlFor="price">Price ($)</Label><Input id="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="19.99" className="h-11" /></div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="upc">Barcode / UPC</Label>
            <Input id="upc" inputMode="numeric" value={upc} onChange={(e) => setUpc(e.target.value)} placeholder="12 or 13 digits" aria-invalid={upc !== "" && !upcOk} className="h-11" />
            {upc !== "" && !upcOk ? <p className="text-xs text-destructive">Not a valid barcode. The last digit is a check digit, so a typo is caught here.</p> : null}
          </div>

          {save.isPending ? <div><p className="mb-2 text-sm text-muted-foreground">{label}</p><Progress value={Math.max(progress, 6)} /></div> : null}
        </CardContent>
      </Card>
    </AppShell>
  );
}
