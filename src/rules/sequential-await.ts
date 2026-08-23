import { Node, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import type { SourceFile, Statement, VariableStatement } from "ts-morph";
import type { AnalysisContext, AsyncDoctorRule, Finding } from "../core/types.js";

const RULE_NAME = "sequential-await";

/** `const x = await f()` 형태의 선언문 하나에서 뽑아낸 정보 */
interface AwaitDeclaration {
  statement: VariableStatement;
  /** 이 선언이 바인딩하는 모든 식별자 (구조 분해 포함). 의존성 판단에 사용 */
  names: string[];
  /** 선언 이름 텍스트 — 구조 분해면 `{ id, name }` 그대로. suggestion 조립에 사용 */
  targetText: string;
  /** await 뒤 표현식 텍스트 (예: `getUser()`) */
  awaitedText: string;
  /** 의존성 검사 대상이 되는 await 표현식 노드 */
  awaitExpression: Node;
}

/** 선언 이름이 바인딩하는 식별자를 모두 모은다. 구조 분해는 넓게 수집(= 보수적으로 제외)한다 */
function collectBoundNames(nameNode: Node): string[] {
  if (Node.isIdentifier(nameNode)) return [nameNode.getText()];
  return nameNode.getDescendantsOfKind(SyntaxKind.Identifier).map((id) => id.getText());
}

/**
 * 문장이 "단일 변수 선언 + 초기화식이 곧바로 await"인 경우에만 후보로 인정한다.
 * `const x = (await f()).y` 처럼 await가 더 깊이 묻힌 경우는 의도적으로 제외한다(오탐 회피).
 */
function toAwaitDeclaration(statement: Statement): AwaitDeclaration | undefined {
  if (!Node.isVariableStatement(statement)) return undefined;

  // `using`/`await using`은 구조 분해가 금지되고 자원 해제 순서가 역순으로 보장되어야 하므로
  // `Promise.all`로 묶는 제안 자체가 컴파일 불가능한 코드가 된다. 탐지 대상에서 제외한다.
  const declarationKind = statement.getDeclarationKind();
  if (
    declarationKind === VariableDeclarationKind.Using ||
    declarationKind === VariableDeclarationKind.AwaitUsing
  ) {
    return undefined;
  }

  const declarations = statement.getDeclarations();
  if (declarations.length !== 1) return undefined;

  const declaration = declarations[0];
  const initializer = declaration.getInitializer();
  if (!initializer || !Node.isAwaitExpression(initializer)) return undefined;

  const nameNode = declaration.getNameNode();

  return {
    statement,
    names: collectBoundNames(nameNode),
    targetText: nameNode.getText(),
    awaitedText: initializer.getExpression().getText(),
    awaitExpression: initializer,
  };
}

/**
 * 후보의 await 표현식이 앞선 선언들이 만든 변수를 식별자로 참조하는지 확인한다.
 * 인자 전달(`getInventory(user.id)`)이든 메서드 체인 대상(`user.fetch()`)이든
 * 식별자로 등장하기만 하면 의존성이 있다고 보고 탐지에서 제외한다.
 */
function dependsOnGroup(candidate: AwaitDeclaration, group: AwaitDeclaration[]): boolean {
  const referenced = new Set(
    candidate.awaitExpression
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .map((identifier) => identifier.getText()),
  );

  return group.some((declared) => declared.names.some((name) => referenced.has(name)));
}

function createFinding(group: AwaitDeclaration[], context: AnalysisContext): Finding {
  const first = group[0];
  const { line, column } = context.sourceFile.getLineAndColumnAtPos(first.statement.getStart());

  const keyword = first.statement.getDeclarationKind().toString();
  const targets = group.map((declaration) => declaration.targetText).join(", ");
  const calls = group.map((declaration) => declaration.awaitedText).join(", ");

  return {
    rule: RULE_NAME,
    severity: "warning",
    file: context.filePath,
    line,
    column,
    message: "Independent awaits run sequentially.",
    reason:
      "These awaits do not reference each other's results, so the later call only starts " +
      "after the earlier one resolves — total latency becomes the sum instead of the maximum.",
    suggestion: [
      `${keyword} [${targets}] = await Promise.all([${calls}]);`,
      "Keep them sequential only if the calls share implicit state or side effects that must be ordered.",
    ],
    code: group.map((declaration) => declaration.statement.getText()).join("\n"),
  };
}

/**
 * 한 블록의 문장 목록에서 "연속으로 나열되고 서로 참조하지 않는" await 선언 묶음을 찾는다.
 * 묶음 하나당 Finding 하나를 만들고, 위치는 묶음의 첫 문장 시작점으로 잡는다.
 */
function analyzeStatements(statements: Statement[], context: AnalysisContext): Finding[] {
  const findings: Finding[] = [];
  let group: AwaitDeclaration[] = [];

  const flush = (): void => {
    if (group.length >= 2) findings.push(createFinding(group, context));
    group = [];
  };

  for (const statement of statements) {
    const declaration = toAwaitDeclaration(statement);

    // await 선언이 아닌 문장이 끼어들면 연속성이 끊긴다
    if (!declaration) {
      flush();
      continue;
    }

    // 앞선 선언의 결과에 의존하면 정상 순차 처리 — 여기서 묶음을 끊고 새 묶음을 시작한다
    if (group.length > 0 && dependsOnGroup(declaration, group)) {
      flush();
    }

    group.push(declaration);
  }

  flush();
  return findings;
}

/** 문장 목록을 가지는 컨테이너(파일 최상위, 블록, 모듈 블록, switch 절)를 모두 모은다 */
function collectStatementContainers(sourceFile: SourceFile): { getStatements(): Statement[] }[] {
  return [
    sourceFile,
    ...sourceFile.getDescendantsOfKind(SyntaxKind.Block),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.ModuleBlock),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.CaseClause),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.DefaultClause),
  ];
}

/**
 * 서로 의존하지 않는 연속 await를 탐지한다.
 * 정적 분석만으로는 공유 상태·부수효과로 인한 암묵적 의존성을 알 수 없으므로
 * severity는 항상 warning으로 고정한다.
 */
export const sequentialAwaitRule: AsyncDoctorRule = {
  name: RULE_NAME,
  description:
    "Detects consecutive awaits that do not depend on each other and could run in parallel.",
  severity: "warning",

  analyze(context: AnalysisContext): Finding[] {
    const findings: Finding[] = [];

    for (const container of collectStatementContainers(context.sourceFile)) {
      findings.push(...analyzeStatements(container.getStatements(), context));
    }

    return findings;
  },
};
