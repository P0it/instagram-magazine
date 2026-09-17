"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, CircleCheck, Copy, ExternalLink } from "lucide-react";
import { GoogleDriveLogo, GoogleGLogo } from "@/components/brand/logos";
import type { GoogleDriveStatus } from "@/types";
import { useSync, useSystemStatus } from "@/lib/client/queries";
import { api } from "@/lib/client/api";
import { fmtTime } from "@/lib/client/format";
import { SettingsRow, SettingsSection } from "./settings-shell";
import { cn } from "@/lib/utils";

const TREE = `/Instagram Magazine                      <- 내 드라이브 최상위 (OAuth) 또는 GOOGLE_DRIVE_ROOT_FOLDER_ID (서비스 계정)
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
      <SettingsSection title="Google Drive" description="초안·포스트·설정이 전부 여기 저장돼요. Google 계정으로 연결하면 내 드라이브에 /Instagram Magazine 폴더가 자동으로 생겨요.">
        {s ? <GoogleConnection g={s.google} /> : <SettingsRow><span className="text-sm text-label-alt">…</span></SettingsRow>}
        <SettingsRow>
          <div className="flex flex-1 flex-col gap-[3px]">
            <span className="text-[15px] font-semibold">접근 키 · Meta OAuth</span>
            <span className="text-[13px] text-label-alt">
              {s ? (s.access_key_enabled ? "APP_ACCESS_KEY 활성" : "접근 키 없음 — 로컬 개발 모드") : "…"} · {s ? (s.oauth_configured ? "Meta OAuth 설정됨" : "Meta OAuth 미설정") : "…"}
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

      {s?.google.mode !== "mock" && <LegacyImport accounts={s?.accounts ?? []} />}

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

const MODE_LABEL: Record<GoogleDriveStatus["mode"], string> = {
  mock: "Mock · 인메모리 (DRIVE_CLIENT=mock)",
  oauth: "Google 계정 (OAuth)",
  service_account: "서비스 계정",
  none: "자격증명 없음",
};

function CopyButton({ text, label = "복사" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("클립보드에 복사하지 못했어요.");
        }
      }}
      className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-brand hover:bg-fill"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? "복사됨" : label}
    </button>
  );
}

/**
 * Google Drive 연결 카드.
 *  - 연결됨: 이메일 · 루트 폴더 링크
 *  - OAuth 클라이언트 있음: "Google 계정으로 연결" → 콜백이 남긴 refresh token 을 여기서 보여주고 환경변수로 안내
 *  - 없음: Google Cloud 콘솔 설정 안내 (리디렉션 URI 복사)
 */
function GoogleConnection({ g }: { g: GoogleDriveStatus }) {
  const sp = useSearchParams();
  const justConnected = sp.get("google") === "connected";
  const setup = useQuery({ queryKey: ["google-setup"], queryFn: api.googleSetupResult, enabled: justConnected, staleTime: Infinity });
  const qc = useQueryClient();
  useEffect(() => {
    const error = sp.get("error");
    if (error) toast.error(`Google 연결 실패: ${error}`);
  }, [sp]);
  useEffect(() => {
    // 로컬 자동 저장이면 서버 상태가 이미 바뀌었으니 카드를 새로 그린다
    if (setup.data?.result?.saved_locally) void qc.invalidateQueries({ queryKey: ["system-status"] });
  }, [setup.data, qc]);

  const connected = g.mode === "oauth" || g.mode === "service_account";
  const rootUrl = g.root_folder_id ? `https://drive.google.com/drive/folders/${g.root_folder_id}` : null;
  const result = setup.data?.result ?? null;

  return (
    <>
      <SettingsRow>
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-fill-alt hairline-neutral">
          <GoogleDriveLogo size={22} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="text-[15px] font-semibold">{MODE_LABEL[g.mode]}</span>
          {g.error ? (
            <span className="text-[13px] text-negative">{g.error}</span>
          ) : connected ? (
            <span className="text-[13px] text-label-alt">{g.email ? `${g.email} · ` : ""}루트 폴더 {g.root_folder_id}</span>
          ) : g.mode === "mock" ? (
            <span className="text-[13px] text-label-alt">실제 Drive 를 쓰려면 DRIVE_CLIENT=google 로 바꾸고 아래에서 Google 계정을 연결하세요.</span>
          ) : (
            <span className="text-[13px] text-label-alt">아래에서 Google 계정을 연결하세요.</span>
          )}
        </div>
        {rootUrl && (
          <a href={rootUrl} target="_blank" rel="noreferrer" className="flex h-8 items-center gap-1 rounded-md px-2 text-[13px] font-semibold text-brand hover:bg-fill-alt">
            <ExternalLink className="size-3.5" />폴더 열기
          </a>
        )}
      </SettingsRow>

      {result && (
        <div className="mx-5 my-3 flex flex-col gap-3 rounded-xl px-4 py-3.5" style={{ background: "var(--semantic-background-status-positive)" }}>
          <div className="flex items-center gap-2">
            <CircleCheck className="size-4 text-positive" />
            <span className="text-sm font-semibold">{result.email ? `${result.email} 연결 승인됨` : "Google 연결 승인됨"}</span>
          </div>
          {result.saved_locally ? (
            <p className="m-0 text-[13px] leading-normal text-label-alt">
              토큰을 <code className="rounded bg-surface px-1 font-mono text-xs">.env.local</code> 에 저장했어요. 바로 사용할 수 있고, 재시작도 필요 없어요.
              배포(Vercel)에는 같은 값을 <code className="rounded bg-surface px-1 font-mono text-xs">GOOGLE_REFRESH_TOKEN</code> 환경변수로 넣어주세요.
            </p>
          ) : setup.data?.active ? (
            <p className="m-0 text-[13px] text-label-alt">이 토큰은 이미 GOOGLE_REFRESH_TOKEN 으로 설정돼 있어요. 추가로 할 일이 없습니다.</p>
          ) : (
            <>
              <p className="m-0 text-[13px] leading-normal text-label-neutral">
                마지막 한 단계 — 아래 값을 <code className="rounded bg-surface px-1 font-mono text-xs">GOOGLE_REFRESH_TOKEN</code> 환경변수에 넣고 서버를 다시 시작하세요
                (로컬은 <code className="rounded bg-surface px-1 font-mono text-xs">.env.local</code>, 배포는 Vercel 환경변수). 예약 게시·인사이트 크론도 이 토큰으로 Drive 를 열어요.
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1.5 font-mono text-xs hairline">GOOGLE_REFRESH_TOKEN={result.refresh_token}</code>
                <CopyButton text={`GOOGLE_REFRESH_TOKEN=${result.refresh_token}`} />
              </div>
              <p className="m-0 text-xs text-label-assistive">이 값은 지금 한 번만 표시돼요. 잃어버리면 다시 연결하면 됩니다.</p>
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 px-5 pb-4 pt-3.5" style={{ boxShadow: "inset 0 1px 0 var(--semantic-line-solid-alternative)" }}>
        {g.oauth_configured ? (
          <div className="flex flex-wrap items-center gap-3">
            <a href="/api/google/oauth/start" className="flex h-10 items-center gap-2.5 rounded-[10px] bg-surface px-4 text-sm font-semibold text-label hairline-neutral shadow-e-xs hover:bg-fill-alt">
              <GoogleGLogo size={18} />
              {connected ? "다른 Google 계정으로 다시 연결" : "Google 계정으로 연결"}
            </a>
            <span className="text-[13px] text-label-alt">Drive 전체 접근 권한을 요청해요 (ChatGPT 가 넣는 파일도 읽어야 해서).</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-xl bg-fill-alt px-4 py-3.5">
            <span className="text-sm font-semibold">Google OAuth 클라이언트가 아직 없어요</span>
            <p className="m-0 text-[13px] leading-normal text-label-alt">Google 계정으로 연결하려면 Google Cloud 콘솔에서 OAuth 클라이언트를 한 번 만들어야 해요.</p>
            <ol className="m-0 list-decimal space-y-1.5 pl-5 text-[13px] leading-normal text-label-neutral">
              <li><a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">console.cloud.google.com</a> → 프로젝트 생성 → <b>Google Drive API</b> 사용 설정.</li>
              <li>사용자 인증 정보 → OAuth 클라이언트 ID(웹 애플리케이션) 생성. 승인된 리디렉션 URI 에 등록:
                <span className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 font-mono text-xs hairline">{g.redirect_uri}</code>
                  <CopyButton text={g.redirect_uri} />
                </span>
              </li>
              <li>OAuth 동의 화면에서 본인 Google 계정을 테스트 사용자로 추가 (앱 게시 불필요).</li>
              <li>환경변수 <code className="rounded bg-surface px-1 font-mono text-xs">GOOGLE_OAUTH_CLIENT_ID</code> · <code className="rounded bg-surface px-1 font-mono text-xs">GOOGLE_OAUTH_CLIENT_SECRET</code> 를 넣고 서버를 다시 시작하면 여기에 연결 버튼이 나타나요.</li>
            </ol>
            <p className="m-0 text-xs leading-normal text-label-assistive">서비스 계정 방식(GOOGLE_SERVICE_ACCOUNT_JSON + GOOGLE_DRIVE_ROOT_FOLDER_ID)도 계속 지원해요. 둘 다 있으면 OAuth 가 우선.</p>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * 앱 이전에 ChatGPT 가 쓰던 /LIFE/draft/ 같은 폴더의 Google Docs 초안을 채널로 가져온다.
 * 폴더마다 대상 채널을 고르고 한 번 누르면 끝 — 원본은 새 포스트 폴더의 _inbox_original 로 옮겨진다.
 */
function LegacyImport({ accounts }: { accounts: { key: string; name: string }[] }) {
  const qc = useQueryClient();
  const folders = useQuery({ queryKey: ["legacy-folders"], queryFn: api.legacyFolders, staleTime: 60_000 });
  const [target, setTarget] = useState<Record<string, string>>({});
  const run = useMutation({
    mutationFn: (args: { id: string; key: string }) => api.importLegacy(args.id, args.key),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["legacy-folders"] });
      void qc.invalidateQueries({ queryKey: ["posts"] });
      void qc.invalidateQueries({ queryKey: ["system-status"] });
      const parts = [`초안 ${r.created}`, r.needs_repair ? `확인 필요 ${r.needs_repair}` : "", r.errors ? `실패 ${r.errors}` : ""].filter(Boolean).join(" · ");
      (r.errors ? toast.error : toast.success)(`${r.source} → @${r.account_key}: ${parts}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const list = folders.data?.folders ?? [];
  if (folders.isLoading || list.length === 0) return null;

  // 폴더명(LIFE)과 같은 이름의 채널(life)이 있으면 기본 선택
  const guess = (name: string) => accounts.find((a) => a.key === name.toLowerCase())?.key ?? accounts[0]?.key ?? "";

  return (
    <SettingsSection title="기존 초안 가져오기" description="앱 이전에 만든 채널 폴더(예: LIFE/draft)의 Google Docs 초안을 채널로 옮겨요. 원본은 각 포스트 폴더의 _inbox_original 로 이동합니다.">
      {accounts.length === 0 && (
        <SettingsRow><span className="text-[13px] text-cautionary">먼저 계정 · 채널 탭에서 채널을 만들어야 가져올 수 있어요.</span></SettingsRow>
      )}
      {list.map((f) => {
        const key = target[f.id] ?? guess(f.name);
        const busy = run.isPending && run.variables?.id === f.id;
        return (
          <SettingsRow key={f.id}>
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="font-mono text-[15px] font-semibold">{f.name}/draft</span>
              <span className="text-[13px] text-label-alt">초안 {f.drafts}개</span>
            </div>
            <span className="text-[13px] text-label-alt">→</span>
            <select value={key} onChange={(e) => setTarget({ ...target, [f.id]: e.target.value })} disabled={accounts.length === 0} className={cn("h-9 rounded-lg bg-fill-alt px-2 text-[13px] outline-none")}>
              {accounts.map((a) => <option key={a.key} value={a.key}>@{a.key}{a.name && a.name !== a.key ? ` · ${a.name}` : ""}</option>)}
            </select>
            <button
              type="button"
              disabled={!key || run.isPending}
              onClick={() => run.mutate({ id: f.id, key })}
              className="h-9 rounded-[10px] bg-brand px-3 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "가져오는 중…" : "가져오기"}
            </button>
          </SettingsRow>
        );
      })}
    </SettingsSection>
  );
}
