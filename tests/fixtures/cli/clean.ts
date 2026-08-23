declare function processItem(item: string): Promise<void>;

export async function processAllParallel(items: string[]): Promise<void> {
  await Promise.all(items.map((item) => processItem(item)));
}
