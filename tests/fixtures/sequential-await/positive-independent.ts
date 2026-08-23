declare function getUser(): Promise<{ id: string }>;
declare function getInventory(): Promise<string[]>;
declare function log(value: unknown): void;

export async function loadDashboard(): Promise<void> {
  const user = await getUser();
  const inventory = await getInventory();
  log([user, inventory]);
}
