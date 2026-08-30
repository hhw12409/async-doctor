declare function syncFn(): void;

// 반환 타입이 Promise가 아닌 동기 함수 — 탐지되면 안 된다.
export function negativeSync(): void {
  syncFn();
}
