declare function doSomethingAsync(): Promise<void>;

export async function positive1(): Promise<void> {
  doSomethingAsync();
}
