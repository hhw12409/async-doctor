import type { AsyncDoctorRule } from "../core/types.js";
import { noAwaitInLoopRule } from "./no-await-in-loop.js";
import { sequentialAwaitRule } from "./sequential-await.js";
import { noForEachAsyncRule } from "./no-foreach-async.js";

/**
 * rule 레지스트리 — 이 프로젝트의 확장점.
 * 새 rule은 이 파일에 import 한 줄 + 배열 항목 한 줄만 추가하면 analyzer에 반영된다.
 * analyzer.ts는 이 배열만 알고 개별 rule 파일은 알지 못한다.
 */
export const rules: AsyncDoctorRule[] = [
  noAwaitInLoopRule,
  sequentialAwaitRule,
  noForEachAsyncRule,
];

export { noAwaitInLoopRule } from "./no-await-in-loop.js";
export { sequentialAwaitRule } from "./sequential-await.js";
export { noForEachAsyncRule } from "./no-foreach-async.js";
