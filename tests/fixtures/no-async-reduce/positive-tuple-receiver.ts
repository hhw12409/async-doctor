// 튜플 수신자도 isTuple()로 배열류로 인정 — reduce(async ...) 탐지 대상.
export async function firstTwo(pair: [number, number]): Promise<number> {
  return await pair.reduce(async (accP, n) => (await accP) + n, Promise.resolve(0));
}
