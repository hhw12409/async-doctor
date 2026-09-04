export function loadDashboard() {
  return getUser().then((user) => {
    const postsPromise = getPosts().then((posts) => render(user, posts));
    const statsPromise = getStats().then((stats) => renderStats(user, stats));
    return Promise.resolve([postsPromise, statsPromise]);
  });
}

declare function getUser(): Promise<{ id: string }>;
declare function getPosts(): Promise<unknown[]>;
declare function getStats(): Promise<unknown[]>;
declare function render(user: unknown, posts: unknown): unknown;
declare function renderStats(user: unknown, stats: unknown): unknown;
