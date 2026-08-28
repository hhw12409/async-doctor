// 배열 변수의 reduce(async ...) — 누산기 promise를 매 반복 await하는 순차 병목.
export async function sumValues(items: number[]): Promise<number> {
  return await items.reduce(async (accP, item) => {
    const acc = await accP;
    return acc + item;
  }, Promise.resolve(0));
}
