declare function getUser(): Promise<{ id: string }>;
declare function getInventory(): Promise<string[]>;
declare function getOrders(): Promise<string[]>;
declare function log(value: unknown): void;

export async function loadAll(): Promise<void> {
  const user = await getUser();
  const inventory = await getInventory();
  const orders = await getOrders();
  log([user, inventory, orders]);
}
