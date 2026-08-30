declare function doSomethingAsync(): Promise<void>;

export function finallyOnly(): void {
  doSomethingAsync().finally(() => console.log("cleanup"));
}
