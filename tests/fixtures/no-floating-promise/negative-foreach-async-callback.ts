declare function fetchData(): Promise<{ id: string }>;

// forEach(async ...) 콜백 내부 — forEach 자체의 반환 타입은 항상 void이므로
// no-floating-promise는 이 표현식문에 반응하지 않는다. 이 패턴 자체의 문제는
// no-foreach-async가 별도로 담당한다 (겹치지 않는지 확인하는 목적의 fixture).
export function forEachCase(items: string[]): void {
  items.forEach(async (item) => {
    await fetchData();
    console.log(item);
  });
}
