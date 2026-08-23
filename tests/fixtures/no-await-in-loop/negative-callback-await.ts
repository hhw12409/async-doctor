declare function processItem(item: string): Promise<void>;

export function processAllCallback(items: string[]): void {
  items.forEach(async (item) => {
    await processItem(item);
  });
}
