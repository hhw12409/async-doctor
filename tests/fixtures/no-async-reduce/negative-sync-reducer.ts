// 동기 리듀서 — 콜백이 async가 아니므로 병목 아님. 탐지 제외.
export function sumValues(items: number[]): number {
  return items.reduce((acc, item) => acc + item, 0);
}
