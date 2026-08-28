// 콜백이 async지만 본문에서 await하지 않음 — 누산기 promise를 다시 await하는
// 순차 강제가 없으므로 병목으로 보지 않는다. 탐지 제외.
export function noAwait(items: number[]) {
  return items.reduce(async (acc, item) => item, Promise.resolve(0));
}
