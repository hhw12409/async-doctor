declare function doSomethingAsync(): Promise<void>;

// .catch()로 에러 처리가 완료됨 — 탐지되면 안 된다.
export function negativeCatch(): void {
  doSomethingAsync().catch((err) => console.log(err));
}
