/** URL ?ch= → 마지막으로 고른 계정 → 첫 계정 순으로 현재 계정을 정한다. 계정이 없으면 null. */
export function pickChannel(keys: readonly string[], wanted: string | null, remembered: string | null): string | null {
  if (wanted && keys.includes(wanted)) return wanted;
  if (remembered && keys.includes(remembered)) return remembered;
  return keys[0] ?? null;
}

/** 목록 안에서 delta 만큼 돌아가며 이동. 계정이 1개 이하면 그대로. */
export function nextChannel(keys: readonly string[], current: string | null, delta: number): string | null {
  if (keys.length === 0) return null;
  if (keys.length === 1) return keys[0];
  const i = current ? keys.indexOf(current) : -1;
  return keys[(((i + delta) % keys.length) + keys.length) % keys.length];
}
