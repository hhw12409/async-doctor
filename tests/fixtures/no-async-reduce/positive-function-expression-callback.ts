// 인라인 FunctionExpression 콜백(async function (...) { ... })도 탐지 대상.
export async function accumulate(items: number[]): Promise<number> {
  return await items.reduce(async function (accP, item) {
    return (await accP) + (await Promise.resolve(item));
  }, Promise.resolve(0));
}
