"use client";

import { useSync, useSystemStatus } from "@/lib/client/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtTime } from "@/components/dashboard/dashboard";
import { cn } from "@/lib/utils";

export function DriveSettings() {
  const status = useSystemStatus();
  const sync = useSync();
  const s = status.data;

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="shadow-none">
        <CardHeader><CardTitle className="text-sm">저장소</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <Kv k="Drive 클라이언트" v={s ? (s.drive_kind === "google" ? "Google Drive (서비스 계정)" : "Mock (인메모리)") : "…"} />
          <Kv k="접근 키" v={s ? (s.access_key_enabled ? "활성 (APP_ACCESS_KEY)" : "비활성 — 로컬 개발 모드") : "…"} warn={s ? !s.access_key_enabled : false} />
          <Kv k="Meta OAuth" v={s ? (s.oauth_configured ? "설정됨" : "미설정") : "…"} warn={s ? !s.oauth_configured : false} />
          <Kv k="마지막 Inbox 동기화" v={s?.last_sync_at ? fmtTime(s.last_sync_at) : "없음"} />
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>{sync.isPending ? "동기화 중…" : "Inbox 동기화 + index.json 재생성"}</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            index.json 은 캐시입니다. 언제든 삭제해도 다음 동기화에서 재생성됩니다. Google 모드는 <code>DRIVE_CLIENT=google</code> + 서비스 계정 JSON(base64) + 루트 폴더 ID 가 필요합니다.
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader><CardTitle className="text-sm">최근 인제스트 로그 (최대 50)</CardTitle></CardHeader>
        <CardContent>
          {!s || s.recent_ingest.length === 0 ? (
            <p className="text-sm text-muted-foreground">기록 없음</p>
          ) : (
            <div className="max-h-[480px] overflow-y-auto">
              <table className="w-full text-xs">
                <tbody>
                  {s.recent_ingest.map((e, i) => (
                    <tr key={i} className="border-b border-border/60 align-top last:border-0">
                      <td className="py-1.5 pr-2 whitespace-nowrap text-muted-foreground">{fmtTime(e.at)}</td>
                      <td className="py-1.5 pr-2 font-semibold">{e.channel}</td>
                      <td className="py-1.5 pr-2 font-mono">{e.prefix}</td>
                      <td className="py-1.5 pr-2"><span className={cn("rounded px-1 py-0.5", e.result === "created" ? "bg-emerald-500/12" : e.result === "needs_repair" || e.result === "error" ? "bg-rose-500/12" : "bg-muted")}>{e.result}</span></td>
                      <td className="py-1.5 text-muted-foreground">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-none xl:col-span-2">
        <CardHeader><CardTitle className="text-sm">Drive 폴더 구조</CardTitle></CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg bg-muted/50 p-4 font-mono text-xs leading-relaxed">{`/Instagram Magazine                      ← GOOGLE_DRIVE_ROOT_FOLDER_ID (서비스 계정에 편집자 공유)
  /inbox/{LIFE,MIND,AI,POEM}/            ← ChatGPT 착지 지점: YYYY-MM-DD_slug.md + _1.png, _2.png …
  /LIFE/{draft,approved,published}/<post>/
      metadata.json · sources.json · visual-brief.json · editor-state.json
      /assets/source_01.png … · /renders/slide_01.jpg … · /_inbox_original/
  /_system/channels.json · accounts.json(암호화) · index.json(캐시) · ingest-log.json · /style-packs/*.json`}</pre>
        </CardContent>
      </Card>
    </div>
  );
}

function Kv({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-2">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className={cn("text-sm", warn && "text-amber-600")}>{v}</span>
    </div>
  );
}
