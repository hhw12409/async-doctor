export function loadPage() {
  return getUser().then((user) => {
    return user.getPosts().then((posts) => render(user, posts));
  });
}

declare function getUser(): Promise<{ getPosts(): Promise<unknown[]> }>;
declare function render(user: unknown, posts: unknown): unknown;
