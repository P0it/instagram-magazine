import { AI_JOB_STAGES, type AiJob, type AiJobError, type AiJobStage } from "@/types";

export const STAGE_LABEL: Record<AiJobStage, string> = {
  analyze: "분석",
  copy: "카피",
  layout: "레이아웃",
  review: "검수",
  save: "저장",
};

const TOTAL = AI_JOB_STAGES.length;

/** 작업 진행 표시용: 몇 번째 단계인지와 라벨. 끝나면 index === total */
export function jobProgress(job: Pick<AiJob, "status" | "stage">): { index: number; total: number; label: string } {
  const at = AI_JOB_STAGES.indexOf(job.stage);
  switch (job.status) {
    case "queued":
      return { index: 0, total: TOTAL, label: "대기 중" };
    case "running":
      return { index: at, total: TOTAL, label: STAGE_LABEL[job.stage] };
    case "done":
      return { index: TOTAL, total: TOTAL, label: "완료" };
    case "failed":
      return { index: at, total: TOTAL, label: "실패" };
    case "canceled":
      return { index: at, total: TOTAL, label: "취소됨" };
  }
}

/**
 * 다시 시도할 수 있는가. 첨부 사진은 작업이 끝나면 지워지므로 첨부가 있던 작업은 같은 입력으로 다시 돌릴 수 없다
 * (서버도 400 으로 거절한다 — 버튼을 아예 보여 주지 않는다).
 */
export function canRetry(job: Pick<AiJob, "status" | "input">): boolean {
  return (job.status === "failed" || job.status === "canceled") && job.input.attachment_count === 0;
}

export function activeJobCount(jobs: Pick<AiJob, "status">[]): number {
  return jobs.filter((j) => j.status === "queued" || j.status === "running").length;
}

/** 실패 이유 옆에 붙일 안내. 알아서 할 수 있는 게 없으면 빈 문자열 */
export function errorHint(error: AiJobError): string {
  switch (error.kind) {
    case "auth":
      return "설정 > AI 에서 다시 로그인해 주세요.";
    case "quota":
      return "구독 사용 한도에 도달했어요. 한도가 풀린 뒤 다시 시도해 주세요.";
    case "interrupted":
      return "다시 시도를 눌러 주세요.";
    default:
      return "";
  }
}
