declare function process(key: string, value: string): Promise<void>;

// Map.forEach의 콜백 시그니처는 (value, key)로 배열과 다르지만, 이름이 같다는 이유만으로
// 오탐하면 안 된다 — 타입 체커가 isArray()로 걸러야 한다.
export function forEachMap(items: Map<string, string>): void {
  items.forEach(async (value, key) => {
    await process(key, value);
  });
}
