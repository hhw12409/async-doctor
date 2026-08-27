declare function process(item: string): Promise<void>;

export function forEachAsync(items: string[]): void {
  items.forEach(async (item) => {
    await process(item);
  });
}
