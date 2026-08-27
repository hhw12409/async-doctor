declare function process(item: string): Promise<void>;
declare function getNext(): string | undefined;

export async function doWhileBody(): Promise<void> {
  let item = getNext();
  do {
    await process(item ?? "");
    item = getNext();
  } while (item);
}
