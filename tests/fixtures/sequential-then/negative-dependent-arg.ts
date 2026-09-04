export function loadPage() {
  return getUser().then((user) => {
    return getPosts(user.id).then((posts) => render(user, posts));
  });
}

declare function getUser(): Promise<{ id: string }>;
declare function getPosts(id: string): Promise<unknown[]>;
declare function render(user: unknown, posts: unknown): unknown;
