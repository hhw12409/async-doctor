declare function log(item: string): void;

// 콜백은 async지만 내부에 await가 없다 — 완료를 기다리지 못하는 문제 자체가 없다.
export function noAwaitInCallback(items: string[]): void {
  items.forEach(async (item) => {
    log(item);
  });
}
