declare function getUser(): Promise<{ id: string }>;
declare function getOrders(): Promise<string[]>;
declare function log(value: unknown): void;

export async function loadInterrupted(): Promise<void> {
  const user = await getUser();
  log(user);
  const orders = await getOrders();
  log(orders);
}
