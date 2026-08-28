// 동명의 커스텀 reduce 메서드를 가진 클래스 — Array.prototype.reduce가 아니다.
// 수신자 타입이 배열/튜플이 아니므로 탐지 제외.
class Pipeline {
  reduce(cb: (acc: number, item: number) => Promise<number>, init: number): number {
    void cb;
    return init;
  }
}

export async function run(p: Pipeline): Promise<number> {
  return await p.reduce(async (accP, item) => (await accP) + item, 0);
}
