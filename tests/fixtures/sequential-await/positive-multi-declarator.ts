declare function f(): Promise<number>;
declare function g(): Promise<number>;
declare function log(v: unknown): void;

export async function multiDeclarator(): Promise<void> {
  const a = await f(),
    b = await g();
  log([a, b]);
}
