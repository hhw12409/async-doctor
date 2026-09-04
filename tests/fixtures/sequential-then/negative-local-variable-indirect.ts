export function loadPage() {
  return getUser().then((user) => {
    const cached = user.id;
    return getPosts(cached).then((posts) => render(posts));
  });
}

declare function getUser(): Promise<{ id: string }>;
declare function getPosts(id: string): Promise<unknown[]>;
declare function render(posts: unknown): unknown;
