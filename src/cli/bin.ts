#!/usr/bin/env node
/**
 * 실행 진입점 (`bin`). 여기가 유일하게 부수효과를 갖는 CLI 모듈이다.
 *
 * 파싱/분석/출력 로직은 전부 `./index.js`에 있고 이 파일은 프로세스 경계
 * (`process.argv` 읽기, `process.exitCode` 쓰기)만 담당한다.
 * `process.exit()` 대신 `exitCode`를 설정해 stdout/stderr가 잘리지 않도록 한다.
 */
import { run } from "./index.js";

process.exitCode = run(process.argv.slice(2));
