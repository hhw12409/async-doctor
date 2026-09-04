// 프로퍼티 접근(user.id)이 아니라 매개변수 전체가 그대로 함수 인자로 전달되는 변형 케이스.
// referencesHandlerScope()가 프로퍼티 접근 여부와 무관하게 식별자의 정의 지점만으로 판단하는지 압박한다.
export function loadPage() {
  return getUser().then((user) => {
    return getPosts(user).then((posts) => render(user, posts));
  });
}

declare function getUser(): Promise<{ id: string }>;
declare function getPosts(user: unknown): Promise<unknown[]>;
declare function render(user: unknown, posts: unknown): unknown;
