declare function process(item: string): Promise<void>;

export function forEachGenericParam(items: Array<string>): void {
  items.forEach(async (item) => {
    await process(item);
  });
}
