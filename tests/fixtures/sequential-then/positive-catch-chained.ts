export function loadPage() {
  return getUser().then((user) => {
    return getPosts()
      .then((posts) => render(user, posts))
      .catch((err) => log(err));
  });
}

declare function getUser(): Promise<{ id: string }>;
declare function getPosts(): Promise<unknown[]>;
declare function render(user: unknown, posts: unknown): unknown;
declare function log(err: unknown): void;
