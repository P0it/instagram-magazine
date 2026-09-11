"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AtSign as Instagram, Link2, Unlink } from "lucide-react";
import { CHANNEL_KEYS } from "@/types";
import { useAccounts } from "@/lib/client/queries";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  connected: "text-emerald-600",
  expiring: "text-amber-600",
  expired: "text-red-600",
  error: "text-red-600",
};

export function AccountsSettings() {
  const accounts = useAccounts();
  const qc = useQueryClient();
  const sp = useSearchParams();
  const [key, setKey] = useState("life");

  useEffect(() => {
    const connected = sp.get("connected");
    const error = sp.get("error");
    if (connected) toast.success(`계정 연결됨: ${connected}`);
    if (error) toast.error(`연결 실패: ${error}`);
  }, [sp]);

  const disconnect = useMutation({
    mutationFn: (k: string) => api.disconnectAccount(k),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["accounts"] }); void qc.invalidateQueries({ queryKey: ["system-status"] }); toast.success("연결 해제"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const list = accounts.data?.accounts ?? [];
  const oauth = accounts.data?.oauth_configured ?? false;

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="shadow-none">
        <CardHeader><CardTitle className="text-sm">연결된 계정</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {list.length === 0 && <p className="text-sm text-muted-foreground">연결된 계정이 없습니다.</p>}
          {list.map((a) => (
            <div key={a.key} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <Instagram className="size-5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <b>@{a.username}</b>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{a.key}</span>
                  <span className={cn("text-xs font-medium", STATUS_STYLE[a.status])}>{a.status}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  ig_user_id {a.ig_user_id} · 만료 {new Date(a.token_expires_at).toLocaleDateString("ko-KR")} · 갱신 {new Date(a.last_refreshed_at).toLocaleDateString("ko-KR")}
                </div>
                {a.last_error && <div className="mt-1 text-xs text-red-600">{a.last_error}</div>}
              </div>
              {(a.status === "expired" || a.status === "error") && oauth && (
                <Button asChild size="sm" variant="outline"><a href={`/api/instagram/oauth/start?key=${encodeURIComponent(a.key)}`}><Link2 className="size-3.5" /> 재연결</a></Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => disconnect.mutate(a.key)} disabled={disconnect.isPending}><Unlink className="size-3.5" /></Button>
            </div>
          ))}
          <p className="pt-2 text-[11px] text-muted-foreground">토큰은 Drive 의 _system/accounts.json 에 AES-256-GCM 으로 암호화되어 저장되며 브라우저로 전송되지 않습니다. 만료 7일 이내면 앱을 열 때 자동 갱신합니다.</p>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader><CardTitle className="text-sm">새 계정 연결</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!oauth && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
              META_APP_ID / META_APP_SECRET / META_REDIRECT_URI 환경변수가 설정되지 않아 OAuth 를 시작할 수 없습니다. README 의 Meta 앱 설정 절차를 참고하세요.
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground">계정 키 (채널 설정의 instagram_account_key 와 일치)</Label>
            <div className="mt-1 flex gap-1">
              {CHANNEL_KEYS.map((c) => (
                <Button key={c} size="sm" variant={key === c.toLowerCase() ? "default" : "outline"} onClick={() => setKey(c.toLowerCase())}>{c.toLowerCase()}</Button>
              ))}
            </div>
            <Input value={key} onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} className="mt-2 h-8 font-mono text-sm" />
          </div>
          <Button asChild disabled={!oauth || !key}>
            <a href={oauth && key ? `/api/instagram/oauth/start?key=${encodeURIComponent(key)}` : "#"} aria-disabled={!oauth || !key}>
              <Instagram className="size-4" /> Instagram 으로 연결
            </a>
          </Button>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Instagram 프로페셔널 계정(비즈니스/크리에이터)이어야 합니다.</li>
            <li>Meta 앱에 &quot;Instagram API with Instagram Login&quot; 제품 추가, 리디렉션 URI 등록.</li>
            <li>연결 시 instagram_business_basic, instagram_business_content_publish 권한을 요청합니다.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
