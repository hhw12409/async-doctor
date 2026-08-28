// .map(async ...)는 이 rule의 대상이 아니고(메서드명 불일치), 뒤따르는 .reduce는
// 동기 콜백이다. 어느 쪽도 탐지되면 안 된다.
declare function fetchValue(item: number): Promise<number>;

export async function sumValues(items: number[]): Promise<number> {
  const values = await Promise.all(items.map(async (item) => fetchValue(item)));
  return values.reduce((acc, v) => acc + v, 0);
}
