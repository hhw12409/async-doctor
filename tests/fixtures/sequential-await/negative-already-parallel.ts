declare function getUser(): Promise<{ id: string }>;
declare function getOrders(): Promise<string[]>;
declare function log(value: unknown): void;

export async function loadParallel(): Promise<void> {
  const [user, orders] = await Promise.all([getUser(), getOrders()]);
  log([user, orders]);
}
