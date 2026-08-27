import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyzer/analyzer.js";
import { VERSION } from "../../src/core/package-info.js";
import {
  escapeHtml,
  renderSummary,
  renderFinding,
  renderFileSection,
  renderBody,
  HtmlReporter,
  htmlReporter,
} from "../../src/reporter/html-reporter.js";
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

describe("html-reporter", () => {
  describe("escapeHtml — 특수문자 5종", () => {
    it("& < > \" ' 를 각각 올바른 엔티티로 치환한다", () => {
      expect(escapeHtml("&")).toBe("&amp;");
      expect(escapeHtml("<")).toBe("&lt;");
      expect(escapeHtml(">")).toBe("&gt;");
      expect(escapeHtml('"')).toBe("&quot;");
      expect(escapeHtml("'")).toBe("&#39;");
    });

    it("5개 문자가 섞여 있어도 한 번에 올바르게 치환한다 (이중 이스케이프 없음)", () => {
      expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
    });

    it("특수문자가 없는 문자열은 그대로 반환한다", () => {
      expect(escapeHtml("plain text 123")).toBe("plain text 123");
    });

    it("보안 회귀 — <script> 태그가 escapeHtml을 거치면 리터럴로 남지 않는다", () => {
      const malicious = "<script>alert(1)</script>";
      const escaped = escapeHtml(malicious);

      expect(escaped).not.toContain("<script>");
      expect(escaped).not.toContain("</script>");
      expect(escaped).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    });

    it("보안 회귀 — report() 최종 출력에 finding.code의 <script> 태그가 이스케이프되지 않은 채 등장하지 않는다", () => {
      const malicious = makeFinding({ code: "<script>alert(1)</script>" });
      const output = htmlReporter.report([malicious], { verbose: true });

      expect(output).not.toContain("<script>alert(1)</script>");
      expect(output).not.toContain("</script>");
      expect(output).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    });
  });

  describe("renderSummary — 카운트 및 단수/복수", () => {
    it("0건일 때 'No problems' 문구 없이 0 카운트를 낸다", () => {
      const html = renderSummary([]);

      expect(html).toContain("0 problems found");
      expect(html).toContain("0 errors");
      expect(html).toContain("0 warnings");
      expect(html).toContain("0 info");
    });

    it("1건(에러 1개)일 때 단수형 'problem'/'error'를 쓴다", () => {
      const html = renderSummary([makeFinding({ severity: "error" })]);

      expect(html).toContain("1 problem found");
      expect(html).toContain("1 error<");
      expect(html).not.toContain("1 errors");
    });

    it("복수건(에러 2개 + 경고 1개)일 때 복수형을 쓴다", () => {
      const html = renderSummary([
        makeFinding({ severity: "error" }),
        makeFinding({ severity: "error" }),
        makeFinding({ severity: "warning" }),
      ]);

      expect(html).toContain("3 problems found");
      expect(html).toContain("2 errors");
      expect(html).toContain("1 warning<");
      expect(html).not.toContain("1 warnings");
    });

    it("info는 개수와 무관하게 단/복수 변화 없이 항상 'info'로 표기한다", () => {
      const one = renderSummary([makeFinding({ severity: "info" })]);
      const two = renderSummary([
        makeFinding({ severity: "info" }),
        makeFinding({ severity: "info" }),
      ]);

      expect(one).toContain("1 info<");
      expect(two).toContain("2 info<");
      expect(two).not.toContain("2 infos");
    });
  });

  describe("renderFinding — verbose 및 optional 필드", () => {
    it("verbose=false일 때 code가 있어도 출력에 포함하지 않는다", () => {
      const html = renderFinding(makeFinding({ code: "await x();" }), false);

      expect(html).not.toContain("<pre");
      expect(html).not.toContain("await x();");
    });

    it("verbose=true일 때 code를 <pre><code>로 포함한다", () => {
      const html = renderFinding(makeFinding({ code: "await x();" }), true);

      expect(html).toContain('<pre class="finding-code"><code>');
      expect(html).toContain("await x();");
      expect(html).toContain("</code></pre>");
    });

    it("verbose=true여도 code가 없으면 <pre>를 만들지 않는다", () => {
      const html = renderFinding(makeFinding(), true);

      expect(html).not.toContain("<pre");
    });

    it("reason이 없으면 'Why:' 블록이 없다", () => {
      const html = renderFinding(makeFinding(), false);

      expect(html).not.toContain("Why:");
      expect(html).not.toContain("finding-reason");
    });

    it("reason이 있으면 escape되어 'Why:' 블록에 담긴다", () => {
      const html = renderFinding(makeFinding({ reason: "A & B < C" }), false);

      expect(html).toContain("Why:");
      expect(html).toContain("A &amp; B &lt; C");
      expect(html).not.toContain("A & B < C");
    });

    it("suggestion이 없으면 리스트 블록이 없다", () => {
      const html = renderFinding(makeFinding(), false);

      expect(html).not.toContain("finding-suggestions");
    });

    it("suggestion이 빈 배열이어도 리스트 블록이 없다", () => {
      const html = renderFinding(makeFinding({ suggestion: [] }), false);

      expect(html).not.toContain("finding-suggestions");
    });

    it("suggestion 항목들이 escape되어 각각 <li>로 렌더링된다", () => {
      const html = renderFinding(
        makeFinding({ suggestion: ["Use Promise.all()", "<b>batch</b> it"] }),
        false,
      );

      expect(html).toContain('<ul class="finding-suggestions">');
      expect(html).toContain("<li>Use Promise.all()</li>");
      expect(html).toContain("<li>&lt;b&gt;batch&lt;/b&gt; it</li>");
      expect(html).not.toContain("<b>batch</b>");
    });

    it("severity/line/column/rule/message가 escape되어 헤더에 담긴다", () => {
      const html = renderFinding(
        makeFinding({
          severity: "error",
          line: 7,
          column: 3,
          rule: "sequential-await",
          message: "A<B",
        }),
        false,
      );

      expect(html).toContain("severity-error");
      expect(html).toContain(">error<");
      expect(html).toContain("7:3");
      expect(html).toContain("sequential-await");
      expect(html).toContain("A&lt;B");
    });
  });

  describe("renderFileSection / renderBody — 파일별 그룹핑", () => {
    it("renderBody([])는 요약 + 빈 상태 메시지만 낸다", () => {
      const html = renderBody([], false);

      expect(html).toContain("No async bottlenecks found.");
      expect(html).toContain("0 problems found");
      expect(html).not.toContain("<main>");
    });

    it("renderFileSection은 escape된 상대경로를 <h2>로 낸다", () => {
      const file = path.join(process.cwd(), "src", "nested", "sample.ts");
      const html = renderFileSection(file, [makeFinding({ file })], false);

      expect(html).toContain('<h2 class="file-path">');
      expect(html).toContain(path.join("src", "nested", "sample.ts").split(path.sep).join("/"));
    });

    it("renderBody는 findings를 파일별로 그룹핑해 각 섹션에 담는다", () => {
      const fileA = path.join(process.cwd(), "a.ts");
      const fileB = path.join(process.cwd(), "b.ts");
      const findings = [
        makeFinding({ file: fileA, message: "msg-a1" }),
        makeFinding({ file: fileB, message: "msg-b1" }),
        makeFinding({ file: fileA, message: "msg-a2" }),
      ];

      const html = renderBody(findings, false);

      const sectionCount = (html.match(/<section class="file-group">/g) ?? []).length;
      expect(sectionCount).toBe(2);
      expect(html).toContain("msg-a1");
      expect(html).toContain("msg-a2");
      expect(html).toContain("msg-b1");

      // fileA 섹션 안에 두 finding이 같이 담겨야 한다
      const fileAIndex = html.indexOf("a.ts");
      const fileBIndex = html.indexOf("b.ts");
      const msgA1Index = html.indexOf("msg-a1");
      const msgA2Index = html.indexOf("msg-a2");
      expect(msgA1Index).toBeGreaterThan(fileAIndex);
      expect(msgA2Index).toBeGreaterThan(fileAIndex);
      expect(msgA2Index).toBeLessThan(fileBIndex);
    });
  });

  describe("HtmlReporter / htmlReporter — 문서 조립", () => {
    it("format 식별자는 html이다", () => {
      expect(htmlReporter.format).toBe("html");
      expect(new HtmlReporter().format).toBe("html");
    });

    it("문서는 <!doctype html>로 시작해 </html>로 끝난다", () => {
      const output = htmlReporter.report([makeFinding()], { verbose: false });

      expect(output.startsWith("<!doctype html>")).toBe(true);
      expect(output.trim().endsWith("</html>")).toBe(true);
    });

    it("<title>에 VERSION 문자열이 포함된다", () => {
      const output = htmlReporter.report([], {});

      expect(output).toContain(`<title>async-doctor v${VERSION} report</title>`);
    });

    it("findings 0건에서도 유효한 문서 + 빈 상태 메시지를 낸다", () => {
      const output = htmlReporter.report([], {});

      expect(output.startsWith("<!doctype html>")).toBe(true);
      expect(output).toContain("No async bottlenecks found.");
    });

    it("options를 생략하면 verbose=false로 동작한다 (code 스니펫 없음)", () => {
      const output = htmlReporter.report([makeFinding({ code: "await x();" })]);

      expect(output).not.toContain("await x();");
    });

    it("htmlReporter는 HtmlReporter의 인스턴스이며 report()는 동일하게 동작한다", () => {
      expect(htmlReporter).toBeInstanceOf(HtmlReporter);
      expect(htmlReporter.report([makeFinding()], { verbose: true })).toBe(
        new HtmlReporter().report([makeFinding()], { verbose: true }),
      );
    });
  });

  describe("실제 분석 결과 렌더링", () => {
    it("bottleneck.ts의 두 Finding을 파일 섹션 하나에 렌더링한다", () => {
      const findings = analyze([BOTTLENECK]);
      const output = htmlReporter.report(findings, { verbose: false });

      expect(findings).toHaveLength(2);
      expect(output).toContain("Independent awaits run sequentially.");
      expect(output).toContain("Sequential async operation detected inside loop.");

      const sectionCount = (output.match(/<section class="file-group">/g) ?? []).length;
      expect(sectionCount).toBe(1);
    });

    it("clean.ts는 빈 상태 문서를 낸다", () => {
      const findings = analyze([CLEAN]);
      const output = htmlReporter.report(findings, { verbose: false });

      expect(findings).toEqual([]);
      expect(output).toContain("No async bottlenecks found.");
      expect(output).toContain("0 problems found");
    });

    it("verbose 분석 결과에는 실제 코드 스니펫이 <pre><code>로 담긴다", () => {
      const findings = analyze([BOTTLENECK]);
      const output = htmlReporter.report(findings, { verbose: true });

      expect(output).toContain('<pre class="finding-code"><code>');
      expect(output).toContain("await processItem(order);");
    });
  });
});
