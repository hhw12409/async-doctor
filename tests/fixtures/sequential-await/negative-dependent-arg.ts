declare function getUser(): Promise<{ id: string }>;
declare function getInventory(id: string): Promise<string[]>;
declare function log(value: unknown): void;

export async function loadUserInventory(): Promise<void> {
  const user = await getUser();
  const inventory = await getInventory(user.id);
  log([user, inventory]);
}
