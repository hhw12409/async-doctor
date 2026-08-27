export async function loadDashboard() {
  const note = "// async-doctor-disable-next-line";
  const a = await getA();
  const b = await getB();
  return { a, b, note };
}
declare function getA(): Promise<string>;
declare function getB(): Promise<string>;
