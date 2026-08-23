declare function processItem(item: string): Promise<void>;

export async function processGrid(rows: string[][]): Promise<void> {
  for (const row of rows) {
    for (const cell of row) {
      await processItem(cell);
    }
  }
}
