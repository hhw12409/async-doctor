declare function maybeAsync(): Promise<void> | string;

// 반환 타입이 유니온(Promise<void> | string) — 심볼이 하나로 확정되지 않아
// 탐지하지 않는다. (의도된 false negative)
//
// 주의: `Promise<void> | undefined`처럼 undefined와의 유니온은 이 rule이 사용하는
// analyzer.ts의 비-strict 컴파일 옵션(strictNullChecks 미설정)에서는 타입 체커가
// `T | undefined`를 `T`로 접어버려 실제로는 유니온이 남지 않는다 — 즉 그 경우는
// 문서화된 것과 달리 정상 탐지된다. 여기서는 undefined와 무관하게 진짜로 유니온이
// 유지되는 타입(string)을 사용해 "심볼이 확정되지 않는" 케이스를 재현한다.
export function negativeUnion(): void {
  maybeAsync();
}
