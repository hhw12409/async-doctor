declare function getUser(): Promise<{ id: string }>;
declare function getOrders(): Promise<string[]>;
declare function processItem(item: string): Promise<void>;
declare function log(value: unknown): void;

export async function loadAndProcess(): Promise<void> {
  const user = await getUser();
  const orders = await getOrders();
  log(user);

  for (const order of orders) {
    await processItem(order);
  }
}
