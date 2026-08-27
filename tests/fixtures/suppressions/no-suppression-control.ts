export async function loadDashboard() {
  const a = await getA();
  const b = await getB();
  return { a, b };
}
declare function getA(): Promise<string>;
declare function getB(): Promise<string>;
