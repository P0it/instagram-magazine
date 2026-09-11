"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChannelsFileSchema, type ChannelsFile } from "@/types";
import { useChannels, useStylePacks } from "@/lib/client/queries";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ChannelsSettings() {
  const channels = useChannels();
  if (!channels.data) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
  return <ChannelsForm initial={channels.data} />;
}

function ChannelsForm({ initial }: { initial: ChannelsFile }) {
  const packs = useStylePacks();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<ChannelsFile>(initial);
  const [rawMode, setRawMode] = useState(false);
  const [raw, setRaw] = useState(() => JSON.stringify(initial, null, 2));

  const save = useMutation({
    mutationFn: (body: ChannelsFile) => api.saveChannels(body),
    onSuccess: (d) => {
      setDraft(d);
      setRaw(JSON.stringify(d, null, 2));
      void qc.invalidateQueries({ queryKey: ["channels"] });
      void qc.invalidateQueries({ queryKey: ["system-status"] });
      toast.success("채널 설정 저장");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const update = (key: string, patch: Partial<ChannelsFile["channels"][number]>) =>
    setDraft({ channels: draft.channels.map((c) => (c.key === key ? { ...c, ...patch } : c)) });

  function submit() {
    if (rawMode) {
      try {
        save.mutate(ChannelsFileSchema.parse(JSON.parse(raw)));
      } catch (e) {
        toast.error(`JSON 오류: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else save.mutate(draft);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm"><Switch checked={rawMode} onCheckedChange={setRawMode} /> JSON 직접 편집</div>
        <Button onClick={submit} disabled={save.isPending}>저장</Button>
      </div>
      {rawMode ? (
        <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={28} className="font-mono text-xs" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {draft.channels.map((c) => (
            <Card key={c.key} className="shadow-none">
              <CardHeader className="flex flex-row items-center gap-2">
                <span className="size-3 rounded-full" style={{ background: c.color }} />
                <CardTitle className="text-sm">{c.key}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <Field label="이름"><Input value={c.name} onChange={(e) => update(c.key, { name: e.target.value })} className="h-8 text-sm" /></Field>
                <Field label="색">
                  <div className="flex items-center gap-2">
                    <input type="color" value={c.color} onChange={(e) => update(c.key, { color: e.target.value })} className="size-8 rounded border border-border bg-transparent" />
                    <Input value={c.color} onChange={(e) => update(c.key, { color: e.target.value })} className="h-8 font-mono text-xs" />
                  </div>
                </Field>
                <Field label="기본 스타일팩">
                  <Select value={c.default_style_pack ?? "__none"} onValueChange={(v) => update(c.key, { default_style_pack: v === "__none" ? null : v })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">(없음)</SelectItem>
                      {(packs.data?.packs ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Instagram 계정 키"><Input value={c.instagram_account_key ?? ""} onChange={(e) => update(c.key, { instagram_account_key: e.target.value || null })} className="h-8 font-mono text-sm" /></Field>
                <Field label="기본 해시태그 (공백 구분)" full>
                  <Input value={c.default_hashtags.join(" ")} onChange={(e) => update(c.key, { default_hashtags: e.target.value.split(/[\s,]+/).map((t) => t.replace(/^#/, "")).filter(Boolean) })} className="h-8 text-sm" />
                </Field>
                <Field label="캡션 템플릿" full>
                  <Textarea value={c.caption_template} onChange={(e) => update(c.key, { caption_template: e.target.value })} rows={2} className="font-mono text-xs" />
                </Field>
                <div className="col-span-2 flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <div className="text-sm">팩트체크 필수</div>
                    <div className="text-xs text-muted-foreground">승인 게이트에서 sources.fact_check_status = approved 를 요구</div>
                  </div>
                  <Switch checked={c.editorial_rules.fact_check_required} onCheckedChange={(v) => update(c.key, { editorial_rules: { fact_check_required: v } })} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
