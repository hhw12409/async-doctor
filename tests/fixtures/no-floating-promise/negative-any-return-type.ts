declare function unknownFn(): any;

// 반환 타입이 any — 심볼 이름이 "Promise"로 확정되지 않으므로 탐지하지 않는다.
// (의도된 false negative: 오탐보다 미탐을 택하는 프로젝트 원칙)
export function negativeAny(): void {
  unknownFn();
}
