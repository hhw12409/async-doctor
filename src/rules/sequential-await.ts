import { Node, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import type { SourceFile, Statement, VariableDeclarationKind as VarDeclKind } from "ts-morph";
import type { AnalysisContext, AsyncDoctorRule, Finding } from "../core/types.js";

const RULE_NAME = "sequential-await";

/**
 * `const x = await f()`(변수 선언) 또는 `await f();`(선언 없는 표현식문) 하나에서 뽑아낸 정보.
 * 후자는 결과를 바인딩하는 변수가 없으므로 `targetText`/`nameNodes`가 빈 값이 된다.
 */
interface AwaitDeclaration {
  /** 이 후보가 속한 문장. 여러 선언자를 가진 VariableStatement라면 형제 후보끼리 같은 노드를 공유한다 */
  statement: Statement;
  /** 이 선언이 바인딩하는 모든 식별자 노드 (구조 분해 포함). 스코프 인지 의존성 판단에 사용 */
  nameNodes: Node[];
  /** 선언 이름 텍스트 — 구조 분해면 `{ id, name }` 그대로. 선언 없는 표현식문이면 undefined */
  targetText: string | undefined;
  /** await 뒤 표현식 텍스트 (예: `getUser()`) */
  awaitedText: string;
  /** 의존성 검사 대상이 되는 await 표현식 노드 */
  awaitExpression: Node;
  /** VariableStatement에서 왔다면 그 선언 키워드(const/let/var). 표현식문이면 undefined */
  declarationKind: VarDeclKind | undefined;
}

/** 선언 이름이 바인딩하는 식별자 노드를 모두 모은다. 구조 분해는 넓게 수집(= 보수적으로 제외)한다 */
function collectBoundNameNodes(nameNode: Node): Node[] {
  if (Node.isIdentifier(nameNode)) return [nameNode];
  return nameNode.getDescendantsOfKind(SyntaxKind.Identifier);
}

/**
 * 한 VariableStatement 안의 각 선언자(declarator)를 개별 후보로 분리한다.
 * `const a = await f(), b = await g();`처럼 한 문장에 여러 선언자가 있어도
 * 각각 독립적인 AwaitDeclaration이 되어 뒤 선언자가 앞 선언자를 참조하는지도 검사할 수 있다.
 * `using`/`await using`은 구조 분해가 금지되고 자원 해제 순서가 역순으로 보장되어야 하므로
 * `Promise.all`로 묶는 제안 자체가 컴파일 불가능한 코드가 된다. 탐지 대상에서 제외한다.
 * `const x = (await f()).y`처럼 await가 초기화식 최상단이 아니라 더 깊이 묻힌 선언자는
 * 의도적으로 제외한다(오탐 회피, 형제 선언자는 계속 평가한다).
 */
function fromVariableStatement(statement: Node): AwaitDeclaration[] {
  if (!Node.isVariableStatement(statement)) return [];

  const declarationKind = statement.getDeclarationKind();
  if (
    declarationKind === VariableDeclarationKind.Using ||
    declarationKind === VariableDeclarationKind.AwaitUsing
  ) {
    return [];
  }

  const results: AwaitDeclaration[] = [];
  for (const declaration of statement.getDeclarations()) {
    const initializer = declaration.getInitializer();
    if (!initializer || !Node.isAwaitExpression(initializer)) continue;

    const nameNode = declaration.getNameNode();
    results.push({
      statement,
      nameNodes: collectBoundNameNodes(nameNode),
      targetText: nameNode.getText(),
      awaitedText: initializer.getExpression().getText(),
      awaitExpression: initializer,
      declarationKind,
    });
  }
  return results;
}

/**
 * `await f();` 형태의 선언 없는 표현식문을 후보로 인정한다.
 * 결과를 바인딩하는 변수가 없으므로 `nameNodes`는 비워둔다 — 아무도 이 결과를 식별자로
 * 참조할 수 없으므로(참조할 변수 자체가 없음) 의존성 판단에서 항상 "참조 없음"으로 취급된다.
 */
function fromExpressionStatement(statement: Node): AwaitDeclaration[] {
  if (!Node.isExpressionStatement(statement)) return [];

  const expression = statement.getExpression();
  if (!Node.isAwaitExpression(expression)) return [];

  return [
    {
      statement,
      nameNodes: [],
      targetText: undefined,
      awaitedText: expression.getExpression().getText(),
      awaitExpression: expression,
      declarationKind: undefined,
    },
  ];
}

/** 한 문장에서 나올 수 있는 모든 await 후보를 뽑는다 (VariableStatement면 0개 이상, ExpressionStatement면 0개 또는 1개) */
function toAwaitDeclarations(statement: Statement): AwaitDeclaration[] {
  return [...fromVariableStatement(statement), ...fromExpressionStatement(statement)];
}

/**
 * 식별자가 `PropertyAccessExpression`의 `.name` 위치(예: `data.user`의 `user`)에 있는지 확인한다.
 * 이 위치의 식별자는 프로퍼티 "이름표"일 뿐 값으로 평가되는 참조가 아니므로,
 * 변수 스코프 해석 대상에서 제외해야 한다 (그렇지 않으면 프로퍼티명이 앞선 변수명과
 * 우연히 같을 때 실제로는 무관한 두 await를 의존 관계로 오인해 탐지를 놓친다).
 */
function isPropertyAccessName(identifier: Node): boolean {
  const parent = identifier.getParent();
  return Node.isPropertyAccessExpression(parent) && parent.getNameNode() === identifier;
}

/**
 * 후보의 await 표현식이 앞선 선언들이 만든 변수를 실제로 참조하는지 **스코프를 인지해서** 확인한다.
 * 텍스트(식별자 이름)만 비교하지 않고, 각 식별자를 ts-morph의 참조 해석(`getDefinitionNodes`)으로
 * 실제 선언 지점까지 추적해 그 지점이 앞선 그룹의 선언 노드와 정확히 같은 노드인지 비교한다.
 * 이렇게 하면 `data.user`처럼 프로퍼티명이 변수명과 우연히 같은 경우(값 참조가 아님) 뿐 아니라
 * 다른 스코프의 동명 변수(섀도잉)도 올바르게 구분된다 — 텍스트 비교로는 둘 다 오판할 수 있었다.
 */
function dependsOnGroup(candidate: AwaitDeclaration, group: AwaitDeclaration[]): boolean {
  const declaredNodeStarts = new Set(
    group.flatMap((declared) => declared.nameNodes.map((node) => node.getStart())),
  );
  if (declaredNodeStarts.size === 0) return false;

  const referenceIdentifiers = candidate.awaitExpression
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter((identifier) => !isPropertyAccessName(identifier));

  return referenceIdentifiers.some((identifier) =>
    identifier.getDefinitionNodes().some((def) => declaredNodeStarts.has(def.getStart())),
  );
}

function createFinding(group: AwaitDeclaration[], context: AnalysisContext): Finding {
  const first = group[0];
  const { line, column } = context.sourceFile.getLineAndColumnAtPos(first.statement.getStart());

  const namedGroup = group.filter((declaration) => declaration.targetText !== undefined);
  const calls = group.map((declaration) => declaration.awaitedText).join(", ");

  // 그룹 전원이 선언 없는 표현식문이면 대입 없는 Promise.all 제안을, 하나라도 이름이 있으면
  // 구조 분해 대입 제안을 만든다. 이름 없는 자리는 빈 문자열이 되어 배열에 구멍(elision)을
  // 남긴다 — `[a, , c]`는 유효한 JS 구조 분해 문법이라 그대로 컴파일 가능한 코드가 된다.
  const suggestionLine =
    namedGroup.length === 0
      ? `await Promise.all([${calls}]);`
      : `${(namedGroup[0].declarationKind ?? VariableDeclarationKind.Const).toString()} [${group
          .map((declaration) => declaration.targetText ?? "")
          .join(", ")}] = await Promise.all([${calls}]);`;

  // 같은 VariableStatement에서 나온 여러 선언자는 statement 노드를 공유하므로 중복 제거한다
  const uniqueStatementTexts = Array.from(
    new Map(
      group.map((declaration) => [
        declaration.statement.getStart(),
        declaration.statement.getText(),
      ]),
    ).values(),
  );

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
      suggestionLine,
      "Keep them sequential only if the calls share implicit state or side effects that must be ordered.",
    ],
    code: uniqueStatementTexts.join("\n"),
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
    const declarations = toAwaitDeclarations(statement);

    // await 후보가 하나도 없는 문장이 끼어들면 연속성이 끊긴다
    if (declarations.length === 0) {
      flush();
      continue;
    }

    for (const declaration of declarations) {
      // 앞선 선언의 결과에 의존하면 정상 순차 처리 — 여기서 묶음을 끊고 새 묶음을 시작한다.
      // 같은 문장 안의 뒤 선언자가 앞 선언자를 참조하는 경우(`const a = await f(), b = await g(a)`)도
      // group이 즉시 갱신되므로 동일하게 처리된다.
      if (group.length > 0 && dependsOnGroup(declaration, group)) {
        flush();
      }
      group.push(declaration);
    }
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
