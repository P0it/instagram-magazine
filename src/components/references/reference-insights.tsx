"use client";

import { X } from "lucide-react";
import { HOOK_LABEL, type Reference } from "@/types";
import { computeStats } from "@/lib/references/stats";
import { useMemo } from "react";

const DENSITY_LABEL = { low: "여유로움", mid: "보통", high: "빽빽함" } as const;

/** 쌓인 전문가 분석을 모아서 본다 — 무엇이 자주 쓰이고 어떤 훅이 반응이 좋은지 */
export function ReferenceInsights({ refs, onClose, onPickHook }: { refs: Reference[]; onClose: () => void; onPickHook: (hook: string) => void }) {
  const s = useMemo(() => computeStats(refs), [refs]);
  const maxHook = Math.max(1, ...s.hooks.map((h) => h.count));
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside role="dialog" aria-label="인사이트 요약" onClick={(e) => e.stopPropagation()} className="flex h-full w-[min(460px,100vw)] flex-col gap-5 overflow-auto bg-surface p-5 shadow-e-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="m-0 text-lg font-bold tracking-[-0.02em]">인사이트 요약</h2>
            <span className="text-[13px] text-label-alt">분석을 마친 레퍼런스 {s.analyzed}건 / 전체 {s.total}건 기준</span>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="grid size-8 shrink-0 place-items-center rounded-lg text-label-alt hover:bg-fill-alt"><X className="size-4" /></button>
        </div>

        {s.smallSample && (
          <p className="m-0 rounded-xl bg-fill-alt p-3 text-[13px] leading-relaxed text-label-alt">표본이 {s.analyzed}건이라 <b className="text-label-neutral">패턴 후보</b> 수준이에요. 10건 이상 쌓이면 경향으로 볼 수 있어요. 좋아요는 계정 규모에 크게 좌우되니, 팔로워 수가 있는 건 반응률(%)을 같이 보세요.</p>
        )}

        {s.analyzed === 0 ? (
          <p className="m-0 text-sm text-label-alt">아직 분석한 레퍼런스가 없어요. 레퍼런스를 열어 “전문가 분석 실행”을 눌러 주세요.</p>
        ) : (
          <>
            <section className="flex flex-col gap-2">
              <h3 className="m-0 text-sm font-bold">표지 훅 유형</h3>
              <div className="flex flex-col gap-1.5">
                {s.hooks.map((h) => (
                  <button key={h.hook} type="button" onClick={() => onPickHook(h.hook)} title="이 훅의 레퍼런스만 보기" className="flex flex-col gap-1 rounded-lg p-2 text-left hover:bg-fill-alt">
                    <div className="flex items-baseline justify-between text-[13px]">
                      <span className="font-semibold">{HOOK_LABEL[h.hook as keyof typeof HOOK_LABEL] ?? h.hook}</span>
                      <span className="text-label-alt">{h.count}건{h.avgLikes != null ? ` · 평균 좋아요 ${Math.round(h.avgLikes).toLocaleString("ko-KR")}` : ""}{h.avgRate != null ? ` · 반응률 ${h.avgRate.toFixed(1)}%` : ""}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-fill"><div className="h-full rounded-full bg-brand" style={{ width: `${(h.count / maxHook) * 100}%` }} /></div>
                  </button>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="m-0 text-sm font-bold">정보 밀도</h3>
              <div className="flex gap-2">
                {(["low", "mid", "high"] as const).map((k) => (
                  <div key={k} className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-fill-alt py-3">
                    <span className="text-lg font-bold">{s.density[k]}</span>
                    <span className="text-[11px] text-label-alt">{DENSITY_LABEL[k]}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="m-0 text-sm font-bold">자주 쓰인 색 <span className="font-normal text-label-assistive">(비슷한 색은 묶음)</span></h3>
              <div className="flex flex-wrap gap-2">
                {s.colors.map((c) => (
                  <div key={c.hex} className="flex flex-col items-center gap-1" title={`${c.hex} · ${c.count}건`}>
                    <span className="size-9 rounded-full" style={{ background: c.hex, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)" }} />
                    <span className="text-[10px] text-label-assistive">{c.count}건</span>
                  </div>
                ))}
              </div>
            </section>

            {s.avgSlides != null && <p className="m-0 text-[13px] text-label-alt">평균 슬라이드 수 <b className="text-label-neutral">{s.avgSlides.toFixed(1)}장</b></p>}
          </>
        )}
      </aside>
    </div>
  );
}
