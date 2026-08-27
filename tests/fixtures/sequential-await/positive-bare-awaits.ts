declare function f(): Promise<void>;
declare function g(): Promise<void>;

export async function bareAwaits(): Promise<void> {
  await f();
  await g();
}
