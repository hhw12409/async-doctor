export function loadPage() {
  return getUser().then((user) => {
    return getPosts().then((posts) => {
      return render(user, posts);
    });
  });
}

declare function getUser(): Promise<{ id: string }>;
declare function getPosts(): Promise<unknown[]>;
declare function render(user: unknown, posts: unknown): unknown;
