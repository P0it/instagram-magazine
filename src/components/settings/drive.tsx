"use client";

import { useState } from "react";
import { ChevronRight, CircleCheck } from "lucide-react";
import { useSync, useSystemStatus } from "@/lib/client/queries";
import { fmtTime } from "@/lib/client/format";
import { SettingsRow, SettingsSection } from "./settings-shell";
import { cn } from "@/lib/utils";

const TREE = `/Instagram Magazine                      <- GOOGLE_DRIVE_ROOT_FOLDER_ID
  /inbox/<username>/                      <- 계정 연결 시 자동 생성. ChatGPT 착지 지점: YYYY-MM-DD_slug.md + _1.png ...
  /<username>/{draft,approved,published}/<post>/
      metadata.json · sources.json · visual-brief.json · editor-state.json
      /assets/source_01.png ... · /renders/slide_01.jpg ... · /_inbox_original/
  /_system/accounts.json(암호화) · index.json(캐시) · ingest-log.json · /style-packs/*.json`;

export function DriveSettings() {
  const status = useSystemStatus();
  const sync = useSync();
  const [checked, setChecked] = useState(false);
  const s = status.data;

  return (
    <>
      <SettingsSection title="Google Drive" description="초안이 들어오는 폴더예요.">
        <SettingsRow>
          <div className="flex flex-1 flex-col gap-[3px]">
            <span className="text-[15px] font-semibold">저장소</span>
            <span className="text-[13px] text-label-alt">{s ? (s.drive_kind === "google" ? "Google Drive · 서비스 계정" : "Mock · 인메모리 (DRIVE_CLIENT=mock)") : "…"}</span>
          </div>
          <ChevronRight className="size-[18px] opacity-40" />
        </SettingsRow>
        <SettingsRow>
          <div className="flex flex-1 flex-col gap-[3px]">
            <span className="text-[15px] font-semibold">루트 폴더</span>
            <span className="text-[13px] text-label-alt">GOOGLE_DRIVE_ROOT_FOLDER_ID · inbox/채널 아래에 .md + 이미지</span>
            <span className="text-xs text-label-assistive">서비스 계정 이메일에 이 폴더를 편집자로 공유하세요.</span>
          </div>
        </SettingsRow>
        <SettingsRow>
          <div className="flex flex-1 flex-col gap-[3px]">
            <span className="text-[15px] font-semibold">접근 키 · Meta OAuth</span>
            <span className="text-[13px] text-label-alt">
              {s ? (s.access_key_enabled ? "APP_ACCESS_KEY 활성" : "접근 키 없음 — 로컬 개발 모드") : "…"} · {s ? (s.oauth_configured ? "OAuth 설정됨" : "OAuth 미설정") : "…"}
            </span>
          </div>
        </SettingsRow>
        <div className="flex flex-col gap-3 px-5 pb-5 pt-4" style={{ boxShadow: "inset 0 1px 0 var(--semantic-line-solid-alternative)" }}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => sync.mutate(undefined, { onSuccess: () => setChecked(true) })}
              disabled={sync.isPending}
              className="h-10 w-[120px] rounded-[10px] text-sm font-semibold text-label-neutral hairline hover:bg-fill-alt disabled:opacity-50"
            >
              {sync.isPending ? "확인 중…" : "연결 확인"}
            </button>
            <span className="text-[13px] text-label-alt">마지막 동기화 {s?.last_sync_at ? fmtTime(s.last_sync_at) : "없음"}</span>
          </div>
          {checked && (
            <div className="flex flex-col gap-2">
              {(s?.accounts ?? []).length === 0 && <span className="text-[13px] text-label-alt">연결된 계정이 없어 확인할 inbox 폴더가 없어요.</span>}
              {(s?.accounts ?? []).map((a) => (
                <div key={a.key} className="flex items-center gap-2 text-[13px]">
                  <CircleCheck className="size-4 text-positive" />
                  <span className="font-semibold">@{a.key}</span>
                  <span className="text-label-alt">inbox 폴더 확인 · 동기화 완료</span>
                </div>
              ))}
            </div>
          )}
          <p className="m-0 text-[11px] leading-relaxed text-label-assistive">index.json 은 캐시예요. 삭제해도 다음 동기화에서 다시 만들어요.</p>
        </div>
      </SettingsSection>

      <SettingsSection title="최근 인제스트" description="Drive inbox 에서 가져온 결과 (최대 50)">
        {!s || s.recent_ingest.length === 0 ? (
          <SettingsRow><span className="text-sm text-label-alt">기록 없음</span></SettingsRow>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            {s.recent_ingest.map((e, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-2.5 text-xs" style={{ boxShadow: "inset 0 1px 0 var(--semantic-line-solid-alternative)" }}>
                <span className="w-24 shrink-0 text-label-alt">{fmtTime(e.at)}</span>
                <span className="w-28 shrink-0 truncate font-semibold">@{e.channel}</span>
                <span className="min-w-0 flex-1 truncate font-mono">{e.prefix}</span>
                <span className={cn("shrink-0 rounded px-1.5 py-0.5", e.result === "created" ? "text-positive" : e.result === "needs_repair" || e.result === "error" ? "text-negative" : "bg-fill text-label-alt")} style={e.result === "created" ? { background: "var(--semantic-background-status-positive)" } : e.result === "needs_repair" || e.result === "error" ? { background: "var(--semantic-background-status-negative)" } : undefined}>
                  {e.result}
                </span>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Drive 폴더 구조">
        <pre className="m-0 overflow-x-auto px-5 pb-5 font-mono text-[11px] leading-relaxed text-label-neutral">{TREE}</pre>
      </SettingsSection>
    </>
  );
}
