declare function doSomethingAsync(): Promise<void>;

// void 연산자로 의도적 fire-and-forget을 명시 — 탐지되면 안 된다.
export function negativeVoid(): void {
  void doSomethingAsync();
}
