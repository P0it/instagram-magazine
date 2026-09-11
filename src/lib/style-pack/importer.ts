import "server-only";
import { StylePackSchema, type ChannelKey, type StylePack } from "@/types";
import type { DriveClient } from "@/lib/drive/types";
import { stylePacksFolderId } from "@/lib/drive/paths";
import { readChannels, writeChannels } from "@/lib/drive/system-files";
import { BUILTIN_STYLE_PACKS } from "@/presets";

/** _system/style-packs/*.json + 내장 팩. 같은 id 면 Drive 가 우선. */
export async function listStylePacks(drive: DriveClient): Promise<StylePack[]> {
  const folder = await stylePacksFolderId(drive);
  const files = await drive.listChildren(folder);
  const fromDrive: StylePack[] = [];
  for (const f of files) {
    if (!f.name.endsWith(".json")) continue;
    try {
      const parsed = StylePackSchema.safeParse(JSON.parse(await drive.readText(f.id)));
      if (parsed.success) fromDrive.push(parsed.data);
    } catch {
      // 무시
    }
  }
  const ids = new Set(fromDrive.map((s) => s.id));
  return [...fromDrive, ...BUILTIN_STYLE_PACKS.filter((s) => !ids.has(s.id))];
}

export async function getStylePackById(drive: DriveClient, id: string): Promise<StylePack | null> {
  return (await listStylePacks(drive)).find((s) => s.id === id) ?? null;
}

/** style-pack.json 임포트 (Zod 검증 → _system/style-packs/<id>.json) */
export async function importStylePack(drive: DriveClient, raw: unknown): Promise<StylePack> {
  const pack = StylePackSchema.parse({ ...(raw as object), created_at: new Date().toISOString() });
  const folder = await stylePacksFolderId(drive);
  await drive.writeText(folder, `${pack.id}.json`, JSON.stringify(pack, null, 2), "application/json");
  return pack;
}

export async function deleteStylePack(drive: DriveClient, id: string): Promise<boolean> {
  const folder = await stylePacksFolderId(drive);
  const f = await drive.findChild(folder, `${id}.json`);
  if (!f) return false;
  await drive.deleteFile(f.id);
  return true;
}

/** 채널 기본 스타일팩 지정 */
export async function setChannelStylePack(drive: DriveClient, channel: ChannelKey, packId: string | null): Promise<void> {
  const { data, version } = await readChannels(drive);
  const channels = data.channels.map((c) => (c.key === channel ? { ...c, default_style_pack: packId } : c));
  await writeChannels(drive, { channels }, version);
}
