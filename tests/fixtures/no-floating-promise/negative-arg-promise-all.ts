declare function doSomethingAsync(): Promise<void>;

// Promise.all의 인자로 전달됨 — ExpressionStatement가 아니므로 탐지 순회에 걸리지 않는다.
export async function negativeArgPromiseAll(): Promise<void> {
  await Promise.all([doSomethingAsync()]);
}
