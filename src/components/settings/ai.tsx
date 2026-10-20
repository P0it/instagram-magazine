"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import type { AiProviderId, AiProviderStatus } from "@/types";
import { qk, useAiLogout, useAiProviders, useAiSetDefault } from "@/lib/client/queries";
import { SettingsRow, SettingsSection } from "./settings-shell";

const META: Record<AiProviderId, { name: string; method: string }> = {
  claude: { name: "Claude", method: "Claude Code CLI" },
  chatgpt: { name: "ChatGPT", method: "ChatGPT 구독 로그인" },
};

const LOGIN_COMMAND = "claude auth login";
const buttonClass = "h-10 shrink-0 rounded-[10px] px-4 text-sm font-semibold text-label-neutral hairline hover:bg-fill-alt disabled:opacity-50";

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(command).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="flex h-9 items-center gap-2 rounded-[10px] bg-fill px-3 font-mono text-[13px] hover:bg-fill-alt"
      title="복사"
    >
      <span>{command}</span>
      {copied ? <Check className="size-3.5 text-positive" /> : <Copy className="size-3.5 opacity-60" />}
    </button>
  );
}

function ProviderRow({ p, isDefault, canPickDefault }: { p: AiProviderStatus; isDefault: boolean; canPickDefault: boolean }) {
  const logout = useAiLogout();
  const setDefault = useAiSetDefault();
  const meta = META[p.id];
  return (
    <SettingsRow>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold">{meta.name}</span>
          <span className="rounded-full bg-fill px-2 py-0.5 text-[11px] text-label-alt">{p.kind === "cli" ? "CLI" : "OAuth"}</span>
          {isDefault && <span className="rounded-full bg-fill px-2 py-0.5 text-[11px] font-semibold text-label-neutral">기본</span>}
        </div>
        {p.connected ? (
          <span className="text-[13px] text-label-alt">
            {p.account ? `${p.account} · ` : ""}연결됨
            {p.kind === "oauth" && p.expires_at ? ` · 접근 토큰은 ${fmtDateTime(p.expires_at)} 까지이고 자동으로 갱신돼요` : ""}
          </span>
        ) : (
          <span className="text-[13px] text-label-alt">{p.last_error ?? "로그인이 필요해요"}</span>
        )}
        {p.id === "claude" && !p.connected && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-label-alt">
            <span>터미널에서</span>
            <CopyCommand command={LOGIN_COMMAND} />
            <span>를 실행한 뒤 새로고침해 주세요.</span>
          </div>
        )}
        {p.id === "chatgpt" && !p.connected && (
          <span className="text-[12px] leading-relaxed text-label-assistive">
            로그인이 끝나면 127.0.0.1 주소로 돌아와요. 이 PC 에서 앱을 돌리는 동안에만 쓸 수 있어요.
          </span>
        )}
        {!p.supports_images && <span className="text-[12px] text-label-assistive">이 제공자는 이미지를 읽지 못해요. 레퍼런스 이미지 분석은 건너뛰어요.</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {p.connected && canPickDefault && !isDefault && (
          <button type="button" className={buttonClass} disabled={setDefault.isPending} onClick={() => setDefault.mutate(p.id)}>
            기본으로
          </button>
        )}
        {p.id === "chatgpt" && !p.connected && (
          <a href="/api/ai/oauth/chatgpt/start" className={`${buttonClass} flex items-center`}>
            ChatGPT 로그인
          </a>
        )}
        {p.id === "chatgpt" && p.connected && (
          <button type="button" className={buttonClass} disabled={logout.isPending} onClick={() => logout.mutate(p.id)}>
            로그아웃
          </button>
        )}
      </div>
    </SettingsRow>
  );
}

export function AiSettings() {
  const q = useAiProviders();
  const qc = useQueryClient();

  // 로그인 콜백이 ?connected= / ?error= 로 돌려보낸다. 한 번 보여 주고 주소에서 지운다.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const connected = params.get("connected");
    if (!error && !connected) return;
    if (error) toast.error(error);
    if (connected) {
      toast.success("ChatGPT 에 연결했어요");
      void qc.invalidateQueries({ queryKey: qk.aiProviders });
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, [qc]);

  const providers = q.data?.providers ?? [];
  const connectedCount = providers.filter((p) => p.connected).length;
  const effectiveDefault = q.data?.default && providers.find((p) => p.id === q.data!.default)?.connected ? q.data.default : (providers.find((p) => p.connected)?.id ?? null);

  return (
    <SettingsSection title="AI 생성기" description="레퍼런스·템플릿을 보고 캐러셀 초안을 만들 때 쓰는 구독 계정이에요. 구독 한도 안에서 쓰이고, 로그인 정보는 이 PC 밖으로 나가지 않아요.">
      {q.isLoading && (
        <SettingsRow>
          <span className="text-sm text-label-alt">…</span>
        </SettingsRow>
      )}
      {q.isError && (
        <SettingsRow>
          <span className="text-sm text-negative">상태를 불러오지 못했어요</span>
        </SettingsRow>
      )}
      {providers.map((p) => (
        <ProviderRow key={p.id} p={p} isDefault={effectiveDefault === p.id} canPickDefault={connectedCount > 1} />
      ))}
    </SettingsSection>
  );
}
