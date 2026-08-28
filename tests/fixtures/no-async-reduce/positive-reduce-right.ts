// reduceRight(async ...)도 동일한 순차 병목 — reduceRight 식별자 위치에서 탐지.
export async function joinReverse(items: string[]): Promise<string> {
  return await items.reduceRight(async (accP, s) => {
    const acc = await accP;
    return acc + s;
  }, Promise.resolve(""));
}
