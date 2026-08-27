declare function process(item: string): Promise<void>;

// Set도 .forEach(callback)을 가지지만 배열이 아니다 — 타입 체커가 isArray()로 걸러야 한다.
export function forEachSet(items: Set<string>): void {
  items.forEach(async (item) => {
    await process(item);
  });
}
