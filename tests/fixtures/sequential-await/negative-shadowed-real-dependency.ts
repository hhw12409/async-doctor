declare function getUser(): Promise<{ id: string }>;
declare function getOrders(id: string): Promise<string[]>;
declare function process(user: { id: string }): Promise<void>;
declare function log(v: unknown): void;

// 바깥 함수 매개변수 `user`와 안쪽 함수의 지역 변수 `user`는 이름만 같을 뿐 다른 선언이다(섀도잉).
// 안쪽 함수에서는 자신의 `user`에 진짜로 의존하므로(user.id) 여전히 탐지되면 안 된다.
export async function outer(user: { id: string }): Promise<void> {
  await process(user);

  async function inner(): Promise<void> {
    const user = await getUser();
    const orders = await getOrders(user.id);
    log([user, orders]);
  }

  await inner();
}
