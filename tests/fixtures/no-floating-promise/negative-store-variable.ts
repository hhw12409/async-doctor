declare function doSomethingAsync(): Promise<void>;

// 변수에 저장됨 — ExpressionStatement가 아니므로 탐지 순회에 걸리지 않는다.
export function negativeStore(): void {
  const p = doSomethingAsync();
  void p;
}
