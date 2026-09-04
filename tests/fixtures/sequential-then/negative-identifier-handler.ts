// 알려진 한계(의도된 false negative): 바깥 핸들러가 인라인 함수가 아니라 식별자 참조라서
// 본문을 추적할 수 없다. handleUser 내부에 독립적인 중첩 .then()이 있어도 탐지되지 않는다.
export function loadPage() {
  return getUser().then(handleUser);
}

declare function getUser(): Promise<{ id: string }>;
declare function handleUser(user: { id: string }): unknown;
