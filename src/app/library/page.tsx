"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Library as LibraryIcon, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Reveal, StaggerList, StaggerListItem } from "@/components/motion";
import { SafeImg } from "@/components/safe-img";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ListSkeleton } from "@/components/skeletons";
import { api } from "@/lib/api";
import { useProducts } from "@/lib/queries";
import { useLibrary } from "@/store/library";
import { useSession } from "@/store/session";

export default function LibraryPage() {
  const qc = useQueryClient();
  const token = useSession((s) => s.token);
  const items = useLibrary((s) => s.items);
  const remove = useLibrary((s) => s.remove);
  const refresh = useLibrary((s) => s.refresh);
  const { data, isLoading } = useProducts();
  const products = data?.items ?? [];

  useEffect(() => {
    refresh().catch(() => toast.error("Could not load the library"));
  }, [refresh]);

  const removeProduct = useMutation({
    mutationFn: (sku: string) => api.removeProduct(token!, sku),
    onSuccess: () => {
      toast.success("Product removed");
      return Promise.all([qc.invalidateQueries({ queryKey: ["products"] }), refresh()]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      title="Catalog"
      subtitle="Products and photos stored in the database. Photos are matched by vector search."
      back="/"
      footer={<Button render={<Link href="/library/new" />} nativeButton={false} size="lg" className="w-full"><Plus /> Add a product</Button>}
    >
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Products ({products.length})</h2>
      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : products.length === 0 ? (
        <Reveal>
          <Card className="border border-dashed ring-0">
            <CardContent className="grid place-items-center gap-2 py-6 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary"><LibraryIcon size={20} /></span>
              <p className="font-semibold">No products yet</p>
              <p className="max-w-xs text-sm text-muted-foreground">Add products with photos. New photos that look like them are matched automatically.</p>
            </CardContent>
          </Card>
        </Reveal>
      ) : (
        <StaggerList className="space-y-2.5">
          {products.map((p) => (
            <StaggerListItem key={p.Sku}>
              <Card size="sm">
                <CardContent className="flex items-center gap-3">
                  <SafeImg src={p.image_url} className="size-16 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.ProductName}</p>
                    <p className="truncate text-sm text-muted-foreground">{p.Brand} · {p.ClassName} · {p.ColorName}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge>{p.Price}</Badge>
                      <Badge variant="outline">{p.Sku}</Badge>
                      {p.searchable ? <Badge variant="success">Searchable</Badge> : <Badge variant="warning">No vectors</Badge>}
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{p.Barcode}</p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label={`Remove ${p.ProductName}`} disabled={removeProduct.isPending} onClick={() => removeProduct.mutate(p.Sku!)}><Trash2 /></Button>
                </CardContent>
              </Card>
            </StaggerListItem>
          ))}
        </StaggerList>
      )}

      {items.length > 0 ? (
        <>
          <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Saved from tickets ({items.length})</h2>
          <StaggerList className="space-y-2.5">
            {items.map((item) => {
              const m = item.metadata;
              return (
                <StaggerListItem key={item.id}>
                  <Card size="sm">
                    <CardContent className="flex items-center gap-3">
                      <SafeImg src={item.thumb} className="size-16 shrink-0 rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{m.ProductName ?? `${m.Brand ?? "Unbranded"} · ${m.ClassName ?? "Item"}`}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {m.ColorName ? <Badge variant="secondary">{m.ColorName}</Badge> : null}
                          {m.SizeCode ? <Badge variant="secondary">{m.SizeCode}</Badge> : null}
                          <Badge variant="outline">{item.photos} photo{item.photos === 1 ? "" : "s"}</Badge>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" aria-label="Remove item" onClick={() => remove(item.id).then(() => toast.success("Item removed"), () => toast.error("Could not remove the item"))}><Trash2 /></Button>
                    </CardContent>
                  </Card>
                </StaggerListItem>
              );
            })}
          </StaggerList>
        </>
      ) : null}
    </AppShell>
  );
}
