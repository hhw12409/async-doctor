// 콜백이 인라인 Arrow/FunctionExpression이 아니라 식별자 참조 — 호출부에
// isAsync()/hasDirectAwait를 적용할 노드가 없다. 의도적 미탐(문서화된 한계).
export async function sumValues(items: number[]): Promise<number> {
  const reducer = async (accP: Promise<number>, item: number) => (await accP) + item;
  return await items.reduce(reducer, Promise.resolve(0));
}
