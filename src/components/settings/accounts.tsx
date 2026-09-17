"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, ExternalLink } from "lucide-react";
import { InstagramLogo } from "@/components/brand/logos";
import { PresetIdSchema, SlideRoleSchema, type AccountSettingsPatch, type PublicAccount, type SlideRole } from "@/types";
import { useAccounts, useStylePacks, useSystemStatus } from "@/lib/client/queries";
import { api } from "@/lib/client/api";
import { accountMeta } from "@/lib/client/channel";
import { fmtDay } from "@/lib/client/format";
import { LAYOUT_PRESETS } from "@/presets";
import { PALETTE, fieldClass } from "@/components/md/primitives";
import { AvatarPlaceholder } from "@/components/md/placeholder";
import { SettingsSection } from "./settings-shell";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<SlideRole, string> = { cover: "커버", photo: "사진", info: "정보", quote: "인용", screenshot: "스크린샷", closing: "마무리" };

function inboxUrl(a: PublicAccount, driveKind: "mock" | "google" | undefined): string | null {
  return driveKind === "google" ? `https://drive.google.com/drive/folders/${a.inbox_folder_id}` : null;
}

export function AccountsSettings() {
  const accounts = useAccounts();
  const status = useSystemStatus();
  const qc = useQueryClient();
  const sp = useSearchParams();
  const [open, setOpen] = useState<string | null>(null);
  const [mockName, setMockName] = useState("");

  useEffect(() => {
    const connected = sp.get("connected");
    const error = sp.get("error");
    if (connected) toast.success(`@${connected} 을(를) 연결했어요. inbox 폴더가 준비됐어요.`);
    if (error) toast.error(`연결 실패: ${error}`);
  }, [sp]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["accounts"] });
    void qc.invalidateQueries({ queryKey: ["system-status"] });
  };
  const disconnect = useMutation({
    mutationFn: (k: string) => api.disconnectAccount(k),
    onSuccess: () => { invalidate(); toast.success("연결을 해제했어요. Drive 폴더와 포스트는 남아 있어요."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const mockConnect = useMutation({
    mutationFn: (username: string) => api.mockConnectAccount(username),
    onSuccess: (_, username) => { invalidate(); setMockName(""); toast.success(`@${username.replace(/^@/, "").toLowerCase()} 가짜 연결 완료`); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const list = accounts.data?.accounts ?? [];
  const oauth = accounts.data?.oauth_configured ?? false;
  const driveKind = status.data?.drive_kind;
  const isMock = driveKind === "mock";

  return (
    <>
      <SettingsSection title="계정 · 채널" description="Instagram 계정 하나가 채널 하나예요. 연결하면 Drive 에 inbox 폴더가 생기고, 매일 지침에는 그 폴더만 적으면 돼요. 토큰은 Drive 에 암호화 저장되고 브라우저로 내려오지 않아요.">
        {list.length === 0 && (
          <div className="px-5 py-6 text-sm text-label-alt" style={{ boxShadow: "inset 0 1px 0 var(--semantic-line-solid-alternative)" }}>연결된 계정이 없어요. 아래에서 첫 계정을 연결하세요.</div>
        )}
        {list.map((a) => (
          <AccountCard
            key={a.key}
            account={a}
            inboxUrl={inboxUrl(a, driveKind)}
            open={open === a.key}
            onToggle={() => setOpen(open === a.key ? null : a.key)}
            oauth={oauth}
            onDisconnect={() => disconnect.mutate(a.key)}
            disconnecting={disconnect.isPending}
            onSaved={invalidate}
          />
        ))}
        <ConnectSection oauth={oauth} isMock={isMock} mockName={mockName} setMockName={setMockName} onMockConnect={() => mockConnect.mutate(mockName.trim())} mockPending={mockConnect.isPending} />
      </SettingsSection>
    </>
  );
}

function AccountCard({ account: a, inboxUrl, open, onToggle, oauth, onDisconnect, disconnecting, onSaved }: {
  account: PublicAccount;
  inboxUrl: string | null;
  open: boolean;
  onToggle: () => void;
  oauth: boolean;
  onDisconnect: () => void;
  disconnecting: boolean;
  onSaved: () => void;
}) {
  const meta = accountMeta(a);
  const bad = a.status === "expired" || a.status === "error";
  const [copied, setCopied] = useState(false);

  async function copyInbox() {
    try {
      await navigator.clipboard.writeText(inboxUrl ?? a.inbox_folder_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("클립보드에 복사하지 못했어요.");
    }
  }

  return (
    <div data-testid={`account-card-${a.key}`} style={{ boxShadow: "inset 0 1px 0 var(--semantic-line-solid-alternative)" }}>
      <div className="flex items-center gap-3.5 px-5 py-3.5">
        <div className="relative shrink-0">
          <AvatarPlaceholder size={40} ring={meta.color} />
          <span className="absolute -bottom-0.5 -right-0.5 grid size-[18px] place-items-center rounded-full bg-surface"><InstagramLogo size={14} /></span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="flex items-center gap-2 text-[15px] font-semibold">
            <span className="size-2 rounded-full" style={{ background: meta.color }} />
            {meta.name}
            <span className="font-normal text-label-alt">@{a.key}</span>
          </span>
          <span className="text-[13px] text-label-alt">
            {a.status === "connected" ? "연결됨" : a.status === "expiring" ? "만료 임박" : a.status === "expired" ? "만료됨" : "오류"} · 토큰 만료 {fmtDay(a.token_expires_at)}
          </span>
          {meta.handleChanged && (
            <span className="text-xs text-cautionary">Instagram 핸들이 @{a.username} 으로 바뀌었어요. 폴더는 @{a.key} 그대로 사용해요.</span>
          )}
          {a.last_error && <span className="text-xs text-negative">{a.last_error}</span>}
        </div>
        {(bad || a.status === "expiring") && oauth && (
          <a href="/api/instagram/oauth/start" className="rounded-md px-2 py-1 text-[13px] font-semibold text-brand hover:bg-fill-alt">다시 연결</a>
        )}
        <button type="button" onClick={onDisconnect} disabled={disconnecting} className="rounded-md px-2 py-1 text-[13px] font-semibold text-label-alt hover:bg-fill-alt disabled:opacity-50">연결 해제</button>
        <button type="button" onClick={onToggle} aria-expanded={open} className="grid size-8 place-items-center rounded-full hover:bg-fill" title="채널 설정">
          <ChevronDown className={cn("size-4 opacity-70 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      <div className="flex items-center gap-2 px-5 pb-3.5 text-[13px]">
        <span className="shrink-0 text-label-alt">inbox 폴더</span>
        <code className="min-w-0 flex-1 truncate rounded bg-fill-alt px-2 py-1 font-mono text-xs" title={inboxUrl ?? a.inbox_folder_id}>{inboxUrl ?? `inbox/${a.key}/ (id: ${a.inbox_folder_id})`}</code>
        <button type="button" onClick={copyInbox} className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold text-brand hover:bg-fill-alt" title="복사">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? "복사됨" : "복사"}
        </button>
        {inboxUrl && (
          <a href={inboxUrl} target="_blank" rel="noreferrer" className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold text-brand hover:bg-fill-alt">
            <ExternalLink className="size-3.5" />열기
          </a>
        )}
      </div>

      {open && <AccountSettingsForm account={a} onSaved={onSaved} />}
    </div>
  );
}

function AccountSettingsForm({ account: a, onSaved }: { account: PublicAccount; onSaved: () => void }) {
  const packs = useStylePacks();
  const [form, setForm] = useState<AccountSettingsPatch>({
    name: a.name,
    color: a.color,
    default_style_pack: a.default_style_pack,
    default_presets_by_role: { ...a.default_presets_by_role },
    caption_template: a.caption_template,
    default_hashtags: [...a.default_hashtags],
    editorial_rules: { ...a.editorial_rules },
  });
  const [hashtagText, setHashtagText] = useState(a.default_hashtags.join(", "));

  const save = useMutation({
    mutationFn: (patch: AccountSettingsPatch) => api.updateAccount(a.key, patch),
    onSuccess: () => { onSaved(); toast.success("채널 설정을 저장했어요."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  function submit() {
    const default_hashtags = hashtagText.split(/[\s,]+/).map((h) => h.replace(/^#/, "").trim()).filter(Boolean);
    save.mutate({ ...form, default_hashtags });
  }

  return (
    <div className="flex flex-col gap-4 bg-surface-alt px-5 py-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-label-alt">
          채널 이름
          <input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className={cn(fieldClass, "h-9 text-sm")} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-label-alt">
          기본 스타일팩
          <select value={form.default_style_pack ?? "__none"} onChange={(e) => setForm({ ...form, default_style_pack: e.target.value === "__none" ? null : e.target.value })} className={cn(fieldClass, "h-9 text-sm")}>
            <option value="__none">(없음 · 프리셋 기본값)</option>
            {(packs.data?.packs ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-label-alt">채널 색</span>
        <ColorSwatches value={form.color ?? "#171717"} onChange={(color) => setForm({ ...form, color })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-label-alt">역할별 기본 프리셋 (비우면 스타일팩 → 역할 기본)</span>
        <div className="grid gap-2 md:grid-cols-3">
          {SlideRoleSchema.options.map((role) => (
            <label key={role} className="flex items-center gap-2 text-xs">
              <span className="w-14 shrink-0 text-label-alt">{ROLE_LABEL[role]}</span>
              <select
                value={form.default_presets_by_role?.[role] ?? "__none"}
                onChange={(e) => {
                  const next = { ...(form.default_presets_by_role ?? {}) };
                  const parsed = PresetIdSchema.safeParse(e.target.value);
                  if (parsed.success) next[role] = parsed.data;
                  else delete next[role];
                  setForm({ ...form, default_presets_by_role: next });
                }}
                className={cn(fieldClass, "h-8 flex-1 text-xs")}
              >
                <option value="__none">—</option>
                {LAYOUT_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
              </select>
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-label-alt">
          캡션 템플릿
          <textarea value={form.caption_template ?? ""} onChange={(e) => setForm({ ...form, caption_template: e.target.value })} rows={3} className={cn(fieldClass, "font-mono text-xs")} />
          <span className="font-normal text-label-assistive">{"{{caption}}"} · {"{{hashtags}}"} 자리표시자</span>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-label-alt">
          기본 해시태그
          <textarea value={hashtagText} onChange={(e) => setHashtagText(e.target.value)} rows={3} placeholder="쉼표 또는 공백으로 구분" className={cn(fieldClass, "text-xs")} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.editorial_rules?.fact_check_required ?? false} onChange={(e) => setForm({ ...form, editorial_rules: { fact_check_required: e.target.checked } })} />
        게시 전 팩트체크 승인 필수
      </label>
      <div className="flex justify-end">
        <button type="button" onClick={submit} disabled={save.isPending || !form.name?.trim()} className="h-9 rounded-[10px] bg-brand px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {save.isPending ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}

/** 연결 섹션 — 상태별로 다른 안내. Meta 앱이 설정돼야만 실제 OAuth 버튼이 살아난다. */
function ConnectSection({ oauth, isMock, mockName, setMockName, onMockConnect, mockPending }: {
  oauth: boolean;
  isMock: boolean;
  mockName: string;
  setMockName: (v: string) => void;
  onMockConnect: () => void;
  mockPending: boolean;
}) {
  // origin 은 클라이언트에서만 알 수 있으므로 마운트 후에 채운다 (SSR 과 불일치 방지)
  const origin = useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");
  const redirectUri = `${origin}/api/instagram/oauth/callback`;
  const [copied, setCopied] = useState(false);
  async function copyRedirect() {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("클립보드에 복사하지 못했어요.");
    }
  }

  return (
    <div className="flex flex-col gap-4 px-5 pb-5 pt-4" style={{ boxShadow: "inset 0 1px 0 var(--semantic-line-solid-alternative)" }}>
      {oauth ? (
        <div className="flex flex-wrap items-center gap-3">
          <a href="/api/instagram/oauth/start" className="flex h-10 items-center gap-2.5 rounded-[10px] bg-surface px-4 text-sm font-semibold text-label hairline-neutral shadow-e-xs hover:bg-fill-alt">
            <InstagramLogo size={18} />Instagram 계정 연결
          </a>
          <span className="text-[13px] text-label-alt">Meta 로그인 창에서 프로페셔널 계정을 고르면 그 username 으로 채널이 만들어져요.</span>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl bg-fill-alt px-4 py-3.5">
          <div className="flex items-center gap-2">
            <InstagramLogo size={18} />
            <span className="text-sm font-semibold">Meta 앱이 아직 연결되지 않았어요</span>
          </div>
          <p className="m-0 text-[13px] leading-normal text-label-alt">
            실제 Instagram 계정을 붙이려면 Meta 개발자 앱이 필요해요. 한 번만 하면 됩니다.
          </p>
          <ol className="m-0 list-decimal space-y-1.5 pl-5 text-[13px] leading-normal text-label-neutral">
            <li><a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">developers.facebook.com</a> 에서 앱 생성 → <b>Instagram</b> 제품 추가 → &quot;API setup with Instagram login&quot;.</li>
            <li>
              리디렉션 URI 에 아래 주소를 등록:
              <span className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 font-mono text-xs hairline">{redirectUri}</code>
                <button type="button" onClick={copyRedirect} className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-brand hover:bg-fill">
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? "복사됨" : "복사"}
                </button>
              </span>
            </li>
            <li>환경변수 <code className="rounded bg-surface px-1 font-mono text-xs">META_APP_ID</code> · <code className="rounded bg-surface px-1 font-mono text-xs">META_APP_SECRET</code> · <code className="rounded bg-surface px-1 font-mono text-xs">META_REDIRECT_URI</code> 를 넣고 서버를 다시 시작하면 여기에 연결 버튼이 나타나요.</li>
          </ol>
          <p className="m-0 text-xs leading-normal text-label-assistive">
            계정은 프로페셔널(비즈니스/크리에이터)이어야 하고, 연결 시 instagram_business_basic · content_publish · manage_insights 권한을 요청해요. 연결된 username 이 채널 키이자 Drive 폴더명(<code>inbox/&lt;username&gt;/</code>)이 됩니다.
          </p>
        </div>
      )}

      {isMock && (
        <form
          className="flex flex-wrap items-center gap-2 rounded-xl px-4 py-3" style={{ background: "var(--semantic-background-status-cautionary)" }}
          onSubmit={(e) => { e.preventDefault(); if (mockName.trim()) onMockConnect(); }}
        >
          <span className="text-[13px] font-semibold text-cautionary">Mock 모드</span>
          <span className="text-[13px] text-label-alt">실제 OAuth 대신 가짜 계정을 붙여 흐름을 시험할 수 있어요.</span>
          <span className="flex-1" />
          <input value={mockName} onChange={(e) => setMockName(e.target.value)} placeholder="@username" className={cn(fieldClass, "h-9 w-40 py-0 font-mono text-[13px]")} aria-label="Mock 계정 username" />
          <button type="submit" disabled={!mockName.trim() || mockPending} className="h-9 rounded-[10px] bg-surface px-3 text-[13px] font-semibold text-label-neutral hairline hover:bg-fill-alt disabled:opacity-50">
            가짜 연결
          </button>
        </form>
      )}
    </div>
  );
}

/** 설정 폼용 작은 색 스와치 (편집기 PaletteGrid 의 축소판) */
function ColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const cur = value.toUpperCase();
  const list = PALETTE.includes(cur) ? PALETTE : [...PALETTE, cur];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {list.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          onClick={() => onChange(c)}
          className="size-6 rounded-full"
          style={{ background: c, boxShadow: cur === c.toUpperCase() ? "0 0 0 2px var(--semantic-primary-normal), inset 0 0 0 1px rgba(23,23,25,0.14)" : "inset 0 0 0 1px rgba(23,23,25,0.14)" }}
        />
      ))}
      <label title="직접 고르기" className="relative size-6 cursor-pointer overflow-hidden rounded-full" style={{ background: "conic-gradient(#FF3B30, #FF9500, #FFD60A, #34C759, #00BDDE, #0066FF, #AF52DE, #F553DA, #FF3B30)", boxShadow: "inset 0 0 0 1px rgba(23,23,25,0.18)" }}>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#0066FF"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute -inset-1.5 size-[200%] cursor-pointer opacity-0" />
      </label>
      <span className="ml-1 text-xs tabular-nums text-label-alt">{value}</span>
    </div>
  );
}
