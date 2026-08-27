declare function getUser(): Promise<{ id: string }>;
declare function getOrders(key: string): Promise<string[]>;
declare function log(v: unknown): void;

// data.user의 "user"는 프로퍼티명일 뿐, 앞서 선언된 변수 user와 무관하다 — 독립 await로 탐지돼야 한다.
export async function collision(data: { user: string }): Promise<void> {
  const user = await getUser();
  const orders = await getOrders(data.user);
  log([user, orders]);
}
