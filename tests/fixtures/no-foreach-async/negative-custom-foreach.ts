declare function process(value: unknown): Promise<void>;

// 커스텀 타입의 forEach — 이름은 같지만 Array.prototype.forEach가 아니다.
export function forEachCustom(customThing: { forEach(cb: (x: unknown) => unknown): void }): void {
  customThing.forEach(async (x) => {
    await process(x);
  });
}
