import { z } from "zod";
import { addAssetToPost, BadImageError } from "@/lib/metadata/assets";
import { error, handle, json, readJsonBody } from "@/lib/api/respond";
import { fetchStockImage, StockImportError, trackUnsplashDownload } from "@/lib/stock";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  url: z.string(),
  provider: z.enum(["pexels", "unsplash"]),
  downloadLocation: z.string().optional(),
});

/** POST /api/posts/[id]/assets/import — 스톡 사진을 받아 포스트 assets 에 source_NN 으로 저장 */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = Body.parse(await readJsonBody(req));
    try {
      const { bytes, mime } = await fetchStockImage(body.url);
      const saved = await addAssetToPost(id, bytes, { kind: "source", mimeHint: mime });
      if (body.provider === "unsplash" && body.downloadLocation) void trackUnsplashDownload(body.downloadLocation);
      return json(saved);
    } catch (e) {
      if (e instanceof StockImportError) return error(400, e.message, "stock_import");
      if (e instanceof BadImageError) return error(400, e.message, "bad_image");
      throw e;
    }
  });
}
