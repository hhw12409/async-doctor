declare function f(): Promise<number>;
declare function g(): Promise<void>;
declare function log(v: unknown): void;

export async function mixedBareAndDeclared(): Promise<void> {
  const a = await f();
  await g();
  log(a);
}
