// 파생 변형: 수신자 타입이 any(미해석) — isArray()/isTuple() 둘 다 false이므로
// 보수적으로 탐지 제외한다. 인라인 async 콜백 + 직접 await가 있어도 잡히면 안 된다.
export async function sumValues(items: any): Promise<number> {
  return await items.reduce(
    async (accP: Promise<number>, item: number) => (await accP) + item,
    Promise.resolve(0),
  );
}
