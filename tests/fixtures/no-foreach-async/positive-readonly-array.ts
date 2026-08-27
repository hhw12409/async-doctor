declare function process(item: string): Promise<void>;

export function forEachReadonly(items: readonly string[]): void {
  items.forEach(async (item) => {
    await process(item);
  });
}
