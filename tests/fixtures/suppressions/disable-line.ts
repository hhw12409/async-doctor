export async function loadDashboard() {
  const a = await getA(); // async-doctor-disable-line
  const b = await getB();
  return { a, b };
}
declare function getA(): Promise<string>;
declare function getB(): Promise<string>;
