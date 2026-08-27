declare function log(item: string): void;

// 콜백이 async가 아닌 일반 forEach — 이 rule의 관심 대상이 아니다.
export function syncForEach(items: string[]): void {
  items.forEach((item) => {
    log(item);
  });
}
