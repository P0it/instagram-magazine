import { TemplateSchema, type TemplatesFile } from "@/types";
import { getDrive } from "@/lib/drive";
import { readTemplates, writeTemplates } from "@/lib/drive/system-files";
import { handle, json, readJsonBody } from "@/lib/api/respond";

/** GET /api/templates — 내 템플릿 (_system/templates.json). 내장 템플릿은 코드에 있다 */
export async function GET() {
  return handle(async () => {
    const drive = await getDrive();
    const { data } = await readTemplates(drive);
    return json<TemplatesFile>(data);
  });
}

/** POST /api/templates — 템플릿 추가 (id 는 서버가 만든다) */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await readJsonBody(req)) as Record<string, unknown>;
    const id = `my-${Date.now().toString(36)}`;
    const template = TemplateSchema.parse({ ...body, id, source: body.source === "reference" ? "reference" : "custom", created_at: new Date().toISOString() });
    const drive = await getDrive();
    const { data, version } = await readTemplates(drive);
    const templates = [...data.templates, template];
    await writeTemplates(drive, { templates }, version);
    return json<TemplatesFile>({ templates }, { status: 201 });
  });
}
