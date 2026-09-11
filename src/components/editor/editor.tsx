"use client";

import dynamic from "next/dynamic";

/** react-konva 는 window 가 필요하므로 클라이언트에서만 로드 */
const EditorInner = dynamic(() => import("./editor-inner").then((m) => m.EditorInner), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">에디터 로딩 중…</div>
  ),
});

export function Editor({ postId }: { postId: string }) {
  return <EditorInner postId={postId} />;
}
