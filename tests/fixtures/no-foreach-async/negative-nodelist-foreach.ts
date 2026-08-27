// 프로젝트 tsconfig에는 DOM lib가 없으므로 전역 NodeList 대신 같은 모양의 로컬 타입을 사용한다.
// 요점은 동일 — DOM의 NodeList도 배열이 아닌 동명의 .forEach를 가진 대표적인 타입이다.
interface NodeListLike {
  forEach(callback: (node: unknown) => void): void;
}

declare function process(node: unknown): Promise<void>;

export function forEachNodeList(nodes: NodeListLike): void {
  nodes.forEach(async (node) => {
    await process(node);
  });
}
