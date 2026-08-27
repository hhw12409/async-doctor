declare function hasMore(): Promise<boolean>;

// do-while의 조건식은 본문이 아니므로 여전히 제외돼야 한다 (기존 while과 동일 정책).
export async function doWhileCondition(): Promise<void> {
  do {
    console.log("tick");
  } while (await hasMore());
}
