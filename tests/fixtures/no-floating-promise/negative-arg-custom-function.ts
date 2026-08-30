declare function doSomethingAsync(): Promise<void>;
declare function runTask(task: Promise<void>): void;

// Promise.all이 아니라 임의의 사용자 함수 인자로 전달되는 변형 — 이 경우도
// 프로퍼티 접근이 아니라 함수 호출의 인자 위치이므로 ExpressionStatement가 아니다.
export function negativeArgCustomFunction(): void {
  runTask(doSomethingAsync());
}
