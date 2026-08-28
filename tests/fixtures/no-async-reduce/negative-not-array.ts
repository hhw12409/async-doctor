// Map을 캐스팅해 얻은 임의 객체의 reduce — 수신자가 배열이 아니므로 탐지 제외.
export async function fromMap(m: Map<string, number>): Promise<number> {
  const anyM = m as unknown as {
    reduce: (cb: unknown, init: unknown) => Promise<number>;
  };
  return await anyM.reduce(
    async (accP: Promise<number>, v: number) => (await accP) + v,
    0,
  );
}
