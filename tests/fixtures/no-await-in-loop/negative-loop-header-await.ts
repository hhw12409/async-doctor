declare function getItems(): Promise<string[]>;
declare function log(value: unknown): void;

export async function logAllItems(): Promise<void> {
  for (const item of await getItems()) {
    log(item);
  }
}
