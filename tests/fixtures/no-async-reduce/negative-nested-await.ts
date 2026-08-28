// await가 콜백에 직접 있지 않고 콜백 안에 중첩된 화살표 함수 안에만 있다 —
// hasDirectAwait가 함수 경계에서 false를 반환하므로 탐지 제외.
export async function build(items: number[]): Promise<number[]> {
  return await items.reduce(
    async (acc, item) => {
      const helper = async () => await Promise.resolve(item);
      void helper;
      return acc;
    },
    Promise.resolve([] as number[]),
  );
}
