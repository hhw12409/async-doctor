export async function loadDashboard() {
  // async-doctor-disable-next-line no-await-in-loop
  const a = await getA();
  const b = await getB();
  return { a, b };
}
declare function getA(): Promise<string>;
declare function getB(): Promise<string>;
