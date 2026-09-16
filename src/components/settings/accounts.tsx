"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CHANNEL_KEYS, type PublicAccount } from "@/types";
import { useAccounts, useSystemStatus } from "@/lib/client/queries";
import { api } from "@/lib/client/api";
import { CHANNEL_META } from "@/lib/client/channel";
import { fmtDay } from "@/lib/client/format";
import { fieldClass } from "@/components/md/primitives";
import { SettingsRow, SettingsSection } from "./settings-shell";
import { cn } from "@/lib/utils";

export function AccountsSettings() {
  const accounts = useAccounts();
  const status = useSystemStatus();
  const qc = useQueryClient();
  const sp = useSearchParams();
  const [key, setKey] = useState("life");

  useEffect(() => {
    const connected = sp.get("connected");
    const error = sp.get("error");
    if (connected) toast.success(`계정을 연결했어요 · ${connected}`);
    if (error) toast.error(`연결 실패: ${error}`);
  }, [sp]);

  const disconnect = useMutation({
    mutationFn: (k: string) => api.disconnectAccount(k),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      void qc.invalidateQueries({ queryKey: ["system-status"] });
      toast.success("연결을 해제했어요.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const list = accounts.data?.accounts ?? [];
  const oauth = accounts.data?.oauth_configured ?? false;
  const channels = status.data?.channels ?? [];
  const channelOf = (a: PublicAccount) => channels.find((c) => c.instagram_account_key === a.key)?.key;

  return (
    <SettingsSection title="인스타그램 계정" description="채널마다 계정 하나를 매핑해요. 토큰은 Drive 에 암호화 저장되고 브라우저로 내려오지 않아요.">
      {list.length === 0 && (
        <SettingsRow><span className="text-sm text-label-alt">연결된 계정이 없어요.</span></SettingsRow>
      )}
      {list.map((a) => {
        const ch = channelOf(a);
        const bad = a.status === "expired" || a.status === "error";
        return (
          <SettingsRow key={a.key}>
            <div className="size-10 shrink-0 rounded-full" style={{ background: ch ? CHANNEL_META[ch].color : "var(--semantic-interaction-inactive)" }} />
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="text-[15px] font-semibold">@{a.username}</span>
              <span className="text-[13px] text-label-alt">{ch ? `${ch} 채널` : a.key} · 토큰 만료 {fmtDay(a.token_expires_at)}</span>
              {a.last_error && <span className="text-xs text-negative">{a.last_error}</span>}
            </div>
            {a.status === "expiring" && <span className="text-[13px] font-semibold text-cautionary">만료 임박</span>}
            {bad && <span className="text-[13px] font-semibold text-negative">만료됨</span>}
            {(bad || a.status === "expiring") && oauth ? (
              <a href={`/api/instagram/oauth/start?key=${encodeURIComponent(a.key)}`} className="rounded-md px-2 py-1 text-[13px] font-semibold text-brand hover:bg-fill-alt">다시 연결</a>
            ) : (
              <button type="button" onClick={() => disconnect.mutate(a.key)} disabled={disconnect.isPending} className="rounded-md px-2 py-1 text-[13px] font-semibold text-brand hover:bg-fill-alt disabled:opacity-50">연결 해제</button>
            )}
          </SettingsRow>
        );
      })}
      <div className="flex flex-col gap-3 px-5 pb-5 pt-3.5" style={{ boxShadow: "inset 0 1px 0 var(--semantic-line-solid-alternative)" }}>
        {!oauth && (
          <div className="rounded-xl px-3.5 py-3 text-xs text-cautionary" style={{ background: "var(--semantic-background-status-cautionary)" }}>
            META_APP_ID / META_APP_SECRET / META_REDIRECT_URI 환경변수가 없어 OAuth 를 시작할 수 없어요. README 의 Meta 앱 설정 절차를 참고하세요.
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-label-alt">계정 키</span>
          {CHANNEL_KEYS.map((c) => (
            <button key={c} type="button" onClick={() => setKey(c.toLowerCase())} className={cn("h-8 rounded-lg px-3 text-[13px] font-semibold", key === c.toLowerCase() ? "bg-fill text-label" : "bg-fill-alt text-label-alt hover:bg-fill")}>{c.toLowerCase()}</button>
          ))}
          <input value={key} onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} className={cn(fieldClass, "h-8 w-32 py-0 font-mono text-[13px]")} aria-label="계정 키" />
        </div>
        <a
          href={oauth && key ? `/api/instagram/oauth/start?key=${encodeURIComponent(key)}` : undefined}
          aria-disabled={!oauth || !key}
          className={cn("flex h-10 w-[140px] items-center justify-center rounded-[10px] text-sm font-semibold text-label-neutral hairline hover:bg-fill-alt", (!oauth || !key) && "pointer-events-none opacity-50")}
        >
          + 계정 연결
        </a>
        <ol className="m-0 list-decimal space-y-1 pl-5 text-xs text-label-alt">
          <li>Instagram 프로페셔널 계정(비즈니스/크리에이터)이어야 해요.</li>
          <li>Meta 앱에 &quot;Instagram API with Instagram Login&quot; 제품 추가, 리디렉션 URI 등록.</li>
          <li>연결 시 instagram_business_basic, instagram_business_content_publish, instagram_business_manage_insights 권한을 요청해요.</li>
        </ol>
      </div>
    </SettingsSection>
  );
}
