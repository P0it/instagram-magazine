import { handle, json } from "@/lib/api/respond";
import { searchStock, stockProviders, type StockProvider } from "@/lib/stock";

/** GET /api/stock/search?q=&page=&provider= — 키가 없으면 configured:false */
export async function GET(req: Request) {
  return handle(async () => {
    const sp = new URL(req.url).searchParams;
    const q = (sp.get("q") ?? "").trim();
    const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
    const provider = sp.get("provider");
    if (!q) return json({ configured: stockProviders().length > 0, providers: stockProviders(), photos: [], page, hasMore: false });
    return json(await searchStock(q, page, provider === "pexels" || provider === "unsplash" ? (provider as StockProvider) : undefined));
  });
}
