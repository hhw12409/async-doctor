import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyzer/analyzer.js";
import {
  JunitReporter,
  junitReporter,
  escapeXml,
  renderTestcase,
  renderTestsuite,
} from "../../src/reporter/junit-reporter.js";
import type { Finding } from "../../src/core/types.js";

const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/cli");
const BOTTLENECK = path.join(FIXTURE_DIR, "bottleneck.ts");
const CLEAN = path.join(FIXTURE_DIR, "clean.ts");

/** 리포터만 단독으로 압박하기 위한 합성 Finding — rule 구현에 의존하지 않는다 */
function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    rule: "no-await-in-loop",
    severity: "warning",
    file: path.join(process.cwd(), "src", "sample.ts"),
    line: 12,
    column: 5,
    message: "Sequential async operation detected inside loop.",
    ...overrides,
  };
}

describe("junit-reporter", () => {
  describe("escapeXml — 특수문자 5종 + 이스케이프 순서", () => {
    it("& < > \" ' 를 각각 올바른 엔티티로 치환한다", () => {
      expect(escapeXml("&")).toBe("&amp;");
      expect(escapeXml("<")).toBe("&lt;");
      expect(escapeXml(">")).toBe("&gt;");
      expect(escapeXml('"')).toBe("&quot;");
      expect(escapeXml("'")).toBe("&apos;");
    });

    it("5개 문자가 섞여 있어도 한 번에 올바르게 치환한다 (이중 이스케이프 없음)", () => {
      expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
    });

    it("특수문자가 없는 문자열은 그대로 반환한다", () => {
      expect(escapeXml("plain text 123")).toBe("plain text 123");
    });

    it("& 치환이 제일 먼저 실행되어, 소스에 이미 있던 &가 이중 이스케이프되지 않는다", () => {
      // 순서가 반대였다면 '<' → '&lt;' 변환 후 그 '&'가 다시 이스케이프되어 '&amp;lt;'가 됐을 것
      expect(escapeXml("AT&T < 5")).toBe("AT&amp;T &lt; 5");
      expect(escapeXml("AT&T < 5")).not.toContain("&amp;amp;");
      expect(escapeXml("AT&T < 5")).not.toContain("&amp;lt;");
    });
  });

  describe("renderTestcase — 필드 조립", () => {
    it("name은 '{rule} ({line}:{column})' 형식이다", () => {
      const xml = renderTestcase(
        makeFinding({ rule: "sequential-await", line: 7, column: 3 }),
        false,
      );

      expect(xml).toContain('name="sequential-await (7:3)"');
    });

    it("classname은 cwd 기준 상대경로다", () => {
      const file = path.join(process.cwd(), "src", "nested", "sample.ts");
      const xml = renderTestcase(makeFinding({ file }), false);

      expect(xml).toContain(
        `classname="${path.join("src", "nested", "sample.ts").split(path.sep).join("/")}"`,
      );
    });

    it("failure의 message/type 속성은 각각 message/severity를 escape해 담는다", () => {
      const xml = renderTestcase(makeFinding({ message: "A < B", severity: "error" }), false);

      expect(xml).toContain('message="A &lt; B"');
      expect(xml).toContain('type="error"');
    });

    it("reason/suggestion/code가 전부 없으면(non-verbose) failure가 self-closing이다", () => {
      const xml = renderTestcase(makeFinding(), false);

      expect(xml).toMatch(/<failure[^>]*\/>/);
      expect(xml).not.toContain("</failure>");
    });

    it("reason이 있으면 'Why:' 블록과 함께 self-closing이 아니게 된다", () => {
      const xml = renderTestcase(makeFinding({ reason: "왜냐하면" }), false);

      expect(xml).not.toMatch(/<failure[^>]*\/>/);
      expect(xml).toContain("</failure>");
      expect(xml).toContain("Why: 왜냐하면");
    });

    it("suggestion 목록은 'Suggestions:' 헤더 아래 '- ' 접두사로 한 줄씩 나열된다", () => {
      const xml = renderTestcase(
        makeFinding({ suggestion: ["Promise.all을 쓰세요", "또는 배치"] }),
        false,
      );

      expect(xml).toContain("Suggestions:\n- Promise.all을 쓰세요\n- 또는 배치");
    });

    it("reason과 suggestion이 둘 다 있으면 빈 줄로 구분된 두 블록이 된다", () => {
      const xml = renderTestcase(makeFinding({ reason: "이유", suggestion: ["제안1"] }), false);

      expect(xml).toContain("Why: 이유\n\nSuggestions:\n- 제안1");
    });

    it("verbose=false면 code가 있어도 failure 본문에 포함되지 않는다", () => {
      const xml = renderTestcase(makeFinding({ code: "await x();" }), false);

      expect(xml).not.toContain("await x();");
      expect(xml).not.toContain("Code:");
      expect(xml).toMatch(/<failure[^>]*\/>/);
    });

    it("verbose=true이고 code가 있으면 'Code:' 블록으로 본문에 포함된다", () => {
      const xml = renderTestcase(makeFinding({ code: "await x();" }), true);

      expect(xml).toContain("Code:\nawait x();");
      expect(xml).not.toMatch(/<failure[^>]*\/>/);
      expect(xml).toContain("</failure>");
    });

    it("verbose=true여도 code가 없으면 여전히 self-closing이다", () => {
      const xml = renderTestcase(makeFinding(), true);

      expect(xml).toMatch(/<failure[^>]*\/>/);
      expect(xml).not.toContain("Code:");
    });

    it("reason/suggestion/code(verbose)가 모두 있으면 세 블록이 순서대로 빈 줄 구분으로 담긴다", () => {
      const xml = renderTestcase(
        makeFinding({ reason: "이유", suggestion: ["제안1"], code: "await x();" }),
        true,
      );

      expect(xml).toContain("Why: 이유\n\nSuggestions:\n- 제안1\n\nCode:\nawait x();");
    });

    it("failure 본문의 XML 특수문자(reason/suggestion/code 유래)가 이스케이프된다", () => {
      const xml = renderTestcase(
        makeFinding({
          reason: "A & B < C",
          suggestion: ["<b>batch</b> it"],
          code: "if (a < b && c > d) {}",
        }),
        true,
      );

      expect(xml).toContain("Why: A &amp; B &lt; C");
      expect(xml).toContain("- &lt;b&gt;batch&lt;/b&gt; it");
      expect(xml).toContain("if (a &lt; b &amp;&amp; c &gt; d) {}");
      expect(xml).not.toContain("<b>batch</b>");
      expect(xml).not.toContain("A & B < C");
    });

    it("소스 코드 안에 이미 &가 있어도 이중 이스케이프되지 않는다 (&amp;amp; 없음)", () => {
      const xml = renderTestcase(makeFinding({ code: "a && b" }), true);

      expect(xml).toContain("a &amp;&amp; b");
      expect(xml).not.toContain("&amp;amp;");
    });
  });

  describe("renderTestsuite — 파일 단위 그룹핑", () => {
    it("name은 cwd 기준 상대경로다", () => {
      const file = path.join(process.cwd(), "src", "nested", "sample.ts");
      const xml = renderTestsuite(file, [makeFinding({ file })], false);

      expect(xml).toContain(
        `name="${path.join("src", "nested", "sample.ts").split(path.sep).join("/")}"`,
      );
    });

    it("tests/failures는 findings.length와 정확히 같고 errors는 항상 0이다", () => {
      const findings = [makeFinding(), makeFinding(), makeFinding()];
      const xml = renderTestsuite(path.join(process.cwd(), "a.ts"), findings, false);

      expect(xml).toContain('tests="3"');
      expect(xml).toContain('failures="3"');
      expect(xml).toContain('errors="0"');
    });

    it("findings 0건이어도 tests/failures가 0인 testsuite를 만든다", () => {
      const xml = renderTestsuite(path.join(process.cwd(), "a.ts"), [], false);

      expect(xml).toContain('tests="0"');
      expect(xml).toContain('failures="0"');
    });

    it("모든 finding의 testcase가 순서대로 포함된다", () => {
      const findings = [
        makeFinding({ rule: "sequential-await", line: 1, column: 1 }),
        makeFinding({ rule: "no-foreach-async", line: 2, column: 1 }),
      ];
      const xml = renderTestsuite(path.join(process.cwd(), "a.ts"), findings, false);

      const first = xml.indexOf('name="sequential-await (1:1)"');
      const second = xml.indexOf('name="no-foreach-async (2:1)"');
      expect(first).toBeGreaterThan(-1);
      expect(second).toBeGreaterThan(first);
    });
  });

  describe("JunitReporter / junitReporter — 문서 조립", () => {
    it("format 식별자는 junit이다", () => {
      expect(junitReporter.format).toBe("junit");
      expect(new JunitReporter().format).toBe("junit");
    });

    it("findings 0건이면 자식 없는 self-closing <testsuites/> 루트를 정확히 낸다 (완전 일치)", () => {
      const output = junitReporter.report([], {});

      expect(output).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<testsuites/>\n');
      expect(output).not.toContain("<testsuites>");
      expect(output).not.toContain("</testsuites>");
    });

    it("options를 생략해도 findings 0건이면 동일하게 self-closing 루트를 낸다", () => {
      expect(junitReporter.report([])).toBe(
        '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites/>\n',
      );
    });

    it("findings가 있으면 여는/닫는 <testsuites> 태그를 쓴다 (self-closing 아님)", () => {
      const output = junitReporter.report([makeFinding()], {});

      expect(output).toContain("<testsuites>\n");
      expect(output).toContain("\n</testsuites>\n");
      expect(output).not.toContain("<testsuites/>");
    });

    it("options를 생략하면 verbose=false로 동작한다 (code 스니펫 없음)", () => {
      const output = junitReporter.report([makeFinding({ code: "await x();" })]);

      expect(output).not.toContain("await x();");
    });

    it("여러 파일에 걸친 findings는 파일마다 별도 testsuite로, 첫 등장 순서대로 그룹핑된다", () => {
      const fileA = path.join(process.cwd(), "a.ts");
      const fileB = path.join(process.cwd(), "b.ts");
      const findings = [
        makeFinding({ file: fileB, rule: "no-foreach-async", message: "msg-b1" }),
        makeFinding({ file: fileA, rule: "sequential-await", message: "msg-a1" }),
        makeFinding({ file: fileB, rule: "no-async-reduce", message: "msg-b2" }),
      ];

      const output = junitReporter.report(findings, {});

      const suiteCount = (output.match(/<testsuite /g) ?? []).length;
      expect(suiteCount).toBe(2);

      // fileB가 findings 배열에서 먼저 등장하므로 testsuite도 먼저 나와야 한다
      const suiteBIndex = output.indexOf('<testsuite name="b.ts"');
      const suiteAIndex = output.indexOf('<testsuite name="a.ts"');
      expect(suiteBIndex).toBeGreaterThan(-1);
      expect(suiteAIndex).toBeGreaterThan(-1);
      expect(suiteBIndex).toBeLessThan(suiteAIndex);

      // fileB의 testsuite는 tests/failures가 2, fileA는 1이어야 한다
      const suiteBSection = output.slice(suiteBIndex, suiteAIndex);
      expect(suiteBSection).toContain('tests="2"');
      expect(suiteBSection).toContain('failures="2"');
      expect(suiteBSection).toContain("msg-b1");
      expect(suiteBSection).toContain("msg-b2");
      expect(suiteBSection).not.toContain("msg-a1");

      const suiteASection = output.slice(suiteAIndex);
      expect(suiteASection).toContain('tests="1"');
      expect(suiteASection).toContain('failures="1"');
      expect(suiteASection).toContain("msg-a1");
    });

    it("문서는 XML 선언으로 시작한다", () => {
      expect(junitReporter.report([makeFinding()], {}).startsWith('<?xml version="1.0"')).toBe(
        true,
      );
      expect(junitReporter.report([], {}).startsWith('<?xml version="1.0"')).toBe(true);
    });
  });

  describe("실제 분석 결과 렌더링", () => {
    it("bottleneck.ts의 두 Finding을 testsuite 하나, testcase 두 개로 렌더링한다", () => {
      const findings = analyze([BOTTLENECK]);
      const output = junitReporter.report(findings, { verbose: false });

      expect(findings).toHaveLength(2);
      const suiteCount = (output.match(/<testsuite /g) ?? []).length;
      expect(suiteCount).toBe(1);
      expect(output).toContain('tests="2"');
      expect(output).toContain('failures="2"');
      expect(output).toContain('errors="0"');
      expect(output).toContain('name="sequential-await (7:3)"');
      expect(output).toContain('name="no-await-in-loop (12:5)"');
      expect(output).toContain(
        `classname="${path.relative(process.cwd(), BOTTLENECK).split(path.sep).join("/")}"`,
      );
    });

    it("clean.ts는 findings 0건이므로 self-closing <testsuites/> 문서가 된다", () => {
      const findings = analyze([CLEAN]);
      const output = junitReporter.report(findings, { verbose: false });

      expect(findings).toEqual([]);
      expect(output).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<testsuites/>\n');
    });

    it("verbose 분석 결과에는 실제 코드 스니펫이 'Code:' 블록으로 담긴다", () => {
      const findings = analyze([BOTTLENECK]);
      const output = junitReporter.report(findings, { verbose: true });

      expect(output).toContain("Code:");
      expect(output).toContain("await processItem(order);");
    });

    it("non-verbose 분석 결과에는 코드 스니펫이 없다", () => {
      const findings = analyze([BOTTLENECK]);
      const output = junitReporter.report(findings, { verbose: false });

      expect(output).not.toContain("await processItem(order);");
      expect(output).not.toContain("Code:");
    });
  });
});
