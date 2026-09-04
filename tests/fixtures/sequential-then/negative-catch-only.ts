export function loadPage() {
  return getUser().then((user) => {
    return getPosts().catch(() => []);
  });
}

declare function getUser(): Promise<{ id: string }>;
declare function getPosts(): Promise<unknown[]>;
