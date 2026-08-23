declare function getUser(): Promise<{ id: string; fetchDetail(): Promise<string> }>;
declare function log(value: unknown): void;

export async function loadUserDetail(): Promise<void> {
  const user = await getUser();
  const detail = await user.fetchDetail();
  log([user, detail]);
}
