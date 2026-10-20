import { handle, json } from "@/lib/api/respond";
import { StockProviderSchema } from "@/types";
import { searchStock, stockProviders } from "@/lib/stock";

/** GET /api/stock/search?q=&page=&provider= — Pexels·Unsplash 는 키가 있을 때만, artic 은 항상 */
export async function GET(req: Request) {
  return handle(async () => {
    const sp = new URL(req.url).searchParams;
    const q = (sp.get("q") ?? "").trim();
    const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
    const provider = StockProviderSchema.safeParse(sp.get("provider"));
    if (!q) return json({ configured: stockProviders().length > 0, providers: stockProviders(), photos: [], page, hasMore: false });
    return json(await searchStock(q, page, provider.success ? provider.data : undefined));
  });
}
