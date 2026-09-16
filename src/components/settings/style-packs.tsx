"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Upload } from "lucide-react";
import { CHANNEL_KEYS, type StylePack } from "@/types";
import { useChannels, useStylePacks } from "@/lib/client/queries";
import { api } from "@/lib/client/api";
import { BUILTIN_STYLE_PACKS } from "@/presets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const TEMPLATE: StylePack = {
  schema_version: 1,
  id: "my-pack",
  name: "My Pack",
  description: "",
  palette: { background: "#0a0a0a", text: "#ffffff", accent: "#e5e5e5", muted: "#8a8a8a" },
  typography: { fontFamily: "sans", headlineWeight: 700, bodyWeight: 500, letterSpacing: -1, lineHeight: 1.25 },
  tone: {},
  presets_by_role: { cover: "large-editorial", info: "info-dark", closing: "closing-slide" },
  preset_overrides: {},
  references: [],
};

export function StylePacksSettings() {
  const packs = useStylePacks();
  const channels = useChannels();
  const qc = useQueryClient();
  const [json, setJson] = useState(JSON.stringify(TEMPLATE, null, 2));
  const fileRef = useRef<HTMLInputElement>(null);
  const builtinIds = new Set(BUILTIN_STYLE_PACKS.map((p) => p.id));

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["style-packs"] });
    void qc.invalidateQueries({ queryKey: ["channels"] });
    void qc.invalidateQueries({ queryKey: ["system-status"] });
  };
  const importPack = useMutation({
    mutationFn: (raw: unknown) => api.importStylePack(raw),
    onSuccess: (p) => { invalidate(); toast.success(`스타일팩 임포트: ${p.name}`); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteStylePack(id),
    onSuccess: () => { invalidate(); toast.success("삭제됨"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const assign = useMutation({
    mutationFn: (args: { channel: string; pack_id: string | null }) => api.assignStylePack(args.channel, args.pack_id),
    onSuccess: () => { invalidate(); toast.success("채널 기본 스타일팩 변경"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  function submit() {
    try {
      importPack.mutate(JSON.parse(json));
    } catch (e) {
      toast.error(`JSON 오류: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-4">
        <Card className="rounded-2xl border-0 shadow-none">
          <CardHeader><CardTitle className="text-sm">채널 기본값</CardTitle></CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {CHANNEL_KEYS.map((ch) => {
              const cur = channels.data?.channels.find((c) => c.key === ch)?.default_style_pack ?? null;
              return (
                <div key={ch} className="flex items-center gap-2 rounded-lg border border-border p-2">
                  <span className="w-12 text-xs font-bold">{ch}</span>
                  <Select value={cur ?? "__none"} onValueChange={(v) => assign.mutate({ channel: ch, pack_id: v === "__none" ? null : v })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">(없음)</SelectItem>
                      {(packs.data?.packs ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="grid gap-3 md:grid-cols-2">
          {(packs.data?.packs ?? []).map((p) => (
            <Card key={p.id} className="rounded-2xl border-0 shadow-none">
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-sm">{p.name}</CardTitle>
                  <div className="font-mono text-[11px] text-muted-foreground">{p.id}{builtinIds.has(p.id) && " · 내장"}</div>
                </div>
                {!builtinIds.has(p.id) && (
                  <Button size="icon-sm" variant="ghost" onClick={() => remove.mutate(p.id)}><Trash2 className="size-3.5" /></Button>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-xs">
                <p className="text-muted-foreground">{p.description}</p>
                <div className="flex gap-1">
                  {Object.entries(p.palette).map(([k, v]) => (
                    <span key={k} title={`${k} ${v}`} className="size-6 rounded border border-border" style={{ background: v }} />
                  ))}
                  <span className={cn("ml-auto rounded bg-muted px-1.5 py-0.5", p.typography.fontFamily === "serif" && "font-serif")}>{p.typography.fontFamily} {p.typography.headlineWeight}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(p.presets_by_role).map(([role, preset]) => (
                    <span key={role} className="rounded bg-muted px-1.5 py-0.5 text-[10px]"><b>{role}</b> → {preset}</span>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="rounded-2xl border-0 shadow-none">
        <CardHeader><CardTitle className="text-sm">style-pack.json 임포트</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Textarea value={json} onChange={(e) => setJson(e.target.value)} rows={22} className="font-mono text-xs" />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="size-3.5" /> 파일</Button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setJson(await f.text()); }} />
            <Button onClick={submit} disabled={importPack.isPending} className="ml-auto">임포트</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            로컬 레퍼런스 이미지에서 스켈레톤을 만들려면 <code>npm run analyze-refs -- ./refs</code> 를 실행하세요 (scripts/analyze-references.ts).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
