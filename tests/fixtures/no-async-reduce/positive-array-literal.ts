// 배열 리터럴의 reduce(async ...) — concise-body arrow 콜백도 탐지 대상.
export async function total(): Promise<number> {
  return await [1, 2, 3].reduce(async (acc, n) => (await acc) + n, Promise.resolve(0));
}
