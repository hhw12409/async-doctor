// 수신자가 식별자/리터럴이 아니라 배열을 반환하는 메서드 체이닝(.filter(...))의
// 결과여도, 그 타입이 배열이면 reduce(async ...)를 탐지해야 한다.
export async function sumEven(items: number[]): Promise<number> {
  return await items
    .filter((n) => n % 2 === 0)
    .reduce(async (accP, item) => {
      const acc = await accP;
      return acc + item;
    }, Promise.resolve(0));
}
