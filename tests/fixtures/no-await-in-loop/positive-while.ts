declare function processItem(item: string): Promise<void>;

export async function processAllWhile(items: string[]): Promise<void> {
  let i = 0;
  while (i < items.length) {
    await processItem(items[i]);
    i += 1;
  }
}
