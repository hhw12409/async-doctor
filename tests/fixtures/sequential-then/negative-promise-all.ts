export function loadPage() {
  return getUser().then((user) => {
    return Promise.all([getPosts(), getComments()]).then(([posts, comments]) => {
      return render(user, posts, comments);
    });
  });
}

declare function getUser(): Promise<{ id: string }>;
declare function getPosts(): Promise<unknown[]>;
declare function getComments(): Promise<unknown[]>;
declare function render(user: unknown, posts: unknown, comments: unknown): unknown;
