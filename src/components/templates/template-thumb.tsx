"use client";

import { useMemo } from "react";
import type { Template } from "@/types";
import { reflowSlideForHeight } from "@/lib/render/layout";
import { SlideCanvas } from "@/components/editor/canvas";

/** 사진 템플릿 썸네일에 깔 데모 사진 (SVG data URL — same-origin 이라 canvas taint 없음) */
const DEMO_PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9c7ab"/><stop offset="0.6" stop-color="#a87d57"/><stop offset="1" stop-color="#4a3427"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#g)"/><ellipse cx="540" cy="860" rx="330" ry="90" fill="#f4efe6" opacity="0.9"/><rect x="390" y="560" width="300" height="300" rx="20" fill="#fffaf2"/><ellipse cx="540" cy="560" rx="150" ry="34" fill="#5b3a24"/></svg>`,
  );

export function TemplateThumb({ tpl, canvasH, displayWidth }: { tpl: Template; canvasH: number; displayWidth: number }) {
  const state = useMemo(() => reflowSlideForHeight(tpl.design, 1350, canvasH), [tpl, canvasH]);
  return (
    <div className="pointer-events-none overflow-hidden rounded-lg hairline-neutral">
      <SlideCanvas slideState={state} text={tpl.sample_text} imageUrl={tpl.photo ? DEMO_PHOTO : null} displayWidth={displayWidth} canvasHeight={canvasH} />
    </div>
  );
}
