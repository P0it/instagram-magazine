export class JobNotFoundError extends Error {
  constructor(id: string) {
    super(`작업 ${id} 를 찾지 못했어요`);
    this.name = "JobNotFoundError";
  }
}

/** 첨부 사진은 작업이 끝나면 지워지므로 첨부가 있던 작업은 같은 입력으로 다시 돌릴 수 없다 */
export class AttachmentsGoneError extends Error {
  constructor() {
    super("첨부 사진이 이미 지워져서 다시 시도할 수 없어요. 새로 생성해 주세요.");
    this.name = "AttachmentsGoneError";
  }
}

export class JobStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobStateError";
  }
}
