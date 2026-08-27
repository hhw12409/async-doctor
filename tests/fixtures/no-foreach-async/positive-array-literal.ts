declare function process(item: number): Promise<void>;

export function forEachLiteral(): void {
  [1, 2, 3].forEach(async (item) => {
    await process(item);
  });
}
