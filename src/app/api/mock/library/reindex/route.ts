import { embeddingModelName, embedImage } from "@/lib/ml/clip";
import { qcHandler } from "@/lib/qc/http";
import { reindexCatalog } from "@/lib/sm/catalog";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Makes the image vector of every catalog item again with the model in use, so photos can be matched against them. */
export async function POST(request: Request) {
  return qcHandler(request, async () => ({ model: embeddingModelName(), ...(await reindexCatalog((photo) => embedImage(photo))) }));
}
