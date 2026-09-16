"use client";

import Link from "next/link";
import { AtSign } from "lucide-react";

/** 계정 0개일 때 홈·라이브러리·큐 대신 보여주는 안내 한 장 */
export function NoAccounts() {
  return (
    <div className="mx-auto flex w-full max-w-[1560px] flex-1 items-center justify-center px-10 py-16">
      <div className="flex max-w-[420px] flex-col items-center gap-4 rounded-2xl bg-surface px-8 py-14 text-center">
        <div className="grid size-14 place-items-center rounded-2xl bg-fill">
          <AtSign className="size-7 opacity-50" />
        </div>
        <h1 className="m-0 text-xl font-bold tracking-[-0.02em]">Instagram 계정을 연결해 시작하세요</h1>
        <p className="m-0 text-[15px] leading-normal text-label-alt">
          계정을 연결하면 그 계정이 하나의 채널이 되고, Drive 에 초안을 넣을 <code className="rounded bg-fill-alt px-1">inbox</code> 폴더가 자동으로 만들어집니다.
        </p>
        <Link href="/settings/accounts" className="mt-2 flex h-10 items-center rounded-[10px] bg-brand px-4 text-sm font-semibold text-white hover:opacity-90">
          설정 › 계정으로 이동
        </Link>
      </div>
    </div>
  );
}
