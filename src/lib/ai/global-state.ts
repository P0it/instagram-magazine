import "server-only";

/**
 * 모듈이 다시 로드돼도 살아남아야 하는 공유 상태(잠금·토큰 캐시·러너 등)를 globalThis 에 둔다.
 * `next dev` 는 .env.local 이 바뀌면(토큰 갱신·기본 제공자 저장) 프로세스를 다시 띄우지 않고 모듈만 비운다.
 * 모듈 변수에 두면 이전 모듈에서 도는 작업과 새 모듈이 서로 다른 잠금·캐시를 갖게 된다.
 */
export function globalState<T>(key: string, init: () => T): T {
  const g = globalThis as Record<string, unknown>;
  const k = `__magazineDeskAi_${key}`;
  return (g[k] ??= init()) as T;
}
