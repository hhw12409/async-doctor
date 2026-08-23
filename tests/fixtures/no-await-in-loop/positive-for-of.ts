declare function processItem(item: string): Promise<void>;

export async function processAll(items: string[]): Promise<void> {
  for (const item of items) {
    await processItem(item);
  }
}
