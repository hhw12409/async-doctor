declare function f(): Promise<number>;
declare function g(value: number): Promise<number>;
declare function log(v: unknown): void;

// 같은 문장 안에서 뒤 선언자가 앞 선언자에 의존하면 탐지되면 안 된다.
export async function multiDeclaratorDependent(): Promise<void> {
  const a = await f(),
    b = await g(a);
  log([a, b]);
}
