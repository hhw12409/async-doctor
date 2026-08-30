declare function doSomethingAsync(): Promise<void>;

// 이미 await됨 — 탐지되면 안 된다.
export async function negativeAwait(): Promise<void> {
  await doSomethingAsync();
}
