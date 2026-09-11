"use client";

import { useState } from "react";
import { CalendarClock, Send } from "lucide-react";
import type { PostBundle, PublicAccount } from "@/types";
import { usePublish } from "@/lib/client/queries";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fullCaption } from "@/lib/metadata/approval-gate";

/**
 * 게시 시트. 즉시 게시 = 사용자의 명시적 클릭으로만 서버 publish 호출.
 * 예약 = 상태만 scheduled 로 표시 (실행은 /api/cron/publish + 외부 핑거).
 */
export function PublishSheet({
  bundle,
  accounts,
  defaultAccountKey,
  disabled,
  disabledReason,
}: {
  bundle: PostBundle;
  accounts: PublicAccount[];
  defaultAccountKey: string | null;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState(defaultAccountKey ?? accounts[0]?.key ?? "");
  const [mode, setMode] = useState<"immediate" | "scheduled">("immediate");
  const [runAt, setRunAt] = useState(defaultRunAt());
  const publish = usePublish(bundle.metadata.post_id);
  const acc = accounts.find((a) => a.key === account);
  const accountOk = acc && acc.status !== "expired" && acc.status !== "error";

  async function submit() {
    if (!account) return;
    await publish.mutateAsync({
      account_key: account,
      mode,
      run_at: mode === "scheduled" ? new Date(runAt).toISOString() : undefined,
    });
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button disabled={disabled} title={disabledReason}>
          <Send className="size-4" /> Instagram 게시
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-[420px] flex-col sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle>Instagram 게시</SheetTitle>
          <SheetDescription>
            {bundle.metadata.content_type === "carousel" ? `캐러셀 ${bundle.renders.length}장` : "단일 이미지"} · {bundle.metadata.channel}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4">
          <div>
            <Label className="text-xs text-muted-foreground">계정</Label>
            {accounts.length === 0 ? (
              <p className="mt-1 text-sm text-amber-600">연결된 계정이 없습니다. 설정 → 계정에서 연결하세요.</p>
            ) : (
              <Select value={account} onValueChange={setAccount}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="계정 선택" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.key} value={a.key}>
                      @{a.username} <span className="text-muted-foreground">· {a.key} · {a.status}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {acc && !accountOk && <p className="mt-1 text-xs text-red-600">이 계정의 토큰이 만료되었거나 오류 상태입니다. 재연결이 필요합니다.</p>}
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">시점</Label>
            <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              <ModeBtn active={mode === "immediate"} onClick={() => setMode("immediate")}><Send className="size-3.5" /> 지금</ModeBtn>
              <ModeBtn active={mode === "scheduled"} onClick={() => setMode("scheduled")}><CalendarClock className="size-3.5" /> 예약</ModeBtn>
            </div>
            {mode === "scheduled" && (
              <div className="mt-2">
                <Input type="datetime-local" value={runAt} onChange={(e) => setRunAt(e.target.value)} />
                <p className="mt-1 text-[11px] text-muted-foreground">외부 핑거(cron-job.org)가 5분 간격으로 /api/cron/publish 를 호출해야 정시에 게시됩니다.</p>
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">캡션 미리보기</Label>
            <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 font-sans text-xs">{fullCaption(bundle.metadata)}</pre>
          </div>
        </div>

        <SheetFooter>
          <Button onClick={submit} disabled={!account || !accountOk || publish.isPending} className="w-full">
            {publish.isPending ? "처리 중…" : mode === "immediate" ? "지금 게시" : "예약 등록"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm transition-colors ${active ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
      {children}
    </button>
  );
}

function defaultRunAt(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
