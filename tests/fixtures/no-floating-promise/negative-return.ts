declare function doSomethingAsync(): Promise<void>;

// return문으로 호출자에게 위임 — ExpressionStatement가 아니므로 탐지 순회에 걸리지 않는다.
export function negativeReturn(): Promise<void> {
  return doSomethingAsync();
}
