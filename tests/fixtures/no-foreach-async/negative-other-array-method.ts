declare function process(item: string): Promise<string>;

// .map/.reduce 등 forEach가 아닌 다른 배열 메서드 — 오탐 방지 확인.
export async function usesMapAndReduce(items: string[]): Promise<void> {
  await Promise.all(
    items.map(async (item) => {
      return await process(item);
    }),
  );

  items.reduce(async (acc, item) => {
    await acc;
    return process(item);
  }, Promise.resolve(""));
}
