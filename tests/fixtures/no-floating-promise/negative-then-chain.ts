declare function doSomethingAsync(): Promise<void>;

// .then()으로 후속 처리가 완료됨 — 탐지되면 안 된다.
export function negativeThen(): void {
  doSomethingAsync().then(() => console.log("done"));
}
