import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i} size="sm">
          <CardContent className="flex items-center gap-3">
            <Skeleton className="size-14 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TicketSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading ticket">
      <div className="flex gap-2"><Skeleton className="h-6 w-24 rounded-full" /><Skeleton className="h-6 w-14 rounded-full" /></div>
      <Skeleton className="h-64 w-full rounded-2xl" />
      <div className="space-y-3"><Skeleton className="h-5 w-24" /><Skeleton className="h-28 w-full rounded-2xl" /></div>
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 9 }, (_, i) => <div key={i} className="space-y-2"><Skeleton className="h-3 w-16" /><Skeleton className="h-4 w-20" /></div>)}
      </div>
    </div>
  );
}
