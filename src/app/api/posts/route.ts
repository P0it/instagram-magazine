import { z } from "zod";
import { ContentTypeSchema, PostStatusSchema } from "@/types";
import { getDrive } from "@/lib/drive";
import { readIndex } from "@/lib/metadata/index-builder";
import { handle, json } from "@/lib/api/respond";

const QuerySchema = z.object({
  channel: z.string().min(1).optional(),
  status: PostStatusSchema.optional(),
  type: ContentTypeSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
});

/** GET /api/posts?channel=&status=&from=&to=&type= — index.json 기반 */
export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      channel: url.searchParams.get("channel") || undefined,
      status: url.searchParams.get("status") || undefined,
      type: url.searchParams.get("type") || undefined,
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      q: url.searchParams.get("q") || undefined,
    });
    const drive = await getDrive();
    const index = await readIndex(drive);
    const posts = index.posts.filter((p) => {
      if (query.channel && p.channel !== query.channel) return false;
      if (query.status && p.status !== query.status) return false;
      if (query.type && p.content_type !== query.type) return false;
      if (query.from && p.created_at < query.from) return false;
      if (query.to && p.created_at > query.to + "T23:59:59.999Z") return false;
      if (query.q) {
        const needle = query.q.toLowerCase();
        if (!`${p.headline} ${p.topic} ${p.post_id}`.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
    return json({ generated_at: index.generated_at, posts });
  });
}
