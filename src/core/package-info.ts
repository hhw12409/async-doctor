/**
 * 패키지 메타데이터 단일 출처.
 *
 * 버전 문자열을 코드에 하드코딩하면 릴리스마다 `package.json`과 어긋날 위험이 있으므로,
 * `package.json`을 직접 import해서 파생시킨다. `tsconfig.json`이 `resolveJsonModule: true`와
 * `moduleResolution: "Bundler"`를 쓰므로 import attribute 없이 그대로 읽을 수 있고,
 * 번들 시에는 tsup(esbuild)이 필요한 값을 정적으로 인라인한다.
 */
import pkg from "../../package.json";

/** 현재 배포 버전 (`package.json`의 `version`) */
export const VERSION: string = pkg.version;

/** 프로젝트 홈페이지 — SARIF `informationUri` 등에서 사용한다 */
export const HOMEPAGE: string = pkg.homepage;
