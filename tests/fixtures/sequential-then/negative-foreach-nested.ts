export function loadPage(items: unknown[]) {
  return getUser().then((user) => {
    items.forEach(() => {
      getPosts().then((posts) => render(posts));
    });
    return user;
  });
}

declare function getUser(): Promise<{ id: string }>;
declare function getPosts(): Promise<unknown[]>;
declare function render(posts: unknown): unknown;
