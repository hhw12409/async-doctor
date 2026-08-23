# 설정 파일 템플릿

async-doctor-scaffold 스킬의 보충 레퍼런스. core-architect가 초기 스캐폴드 시 그대로 사용하는 설정 파일 전문.

## package.json

```json
{
  "name": "async-doctor",
  "version": "0.1.0",
  "description": "Static analysis CLI that detects sequential async bottlenecks in Node.js/TypeScript code.",
  "type": "module",
  "bin": {
    "async-doctor": "./dist/cli/index.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src tests",
    "format": "prettier --write .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "ts-morph": "^23.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.5.0",
    "tsup": "^8.0.0",
    "vitest": "^2.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0"
  },
  "engines": {
    "node": ">=18"
  },
  "license": "MIT"
}
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist"
  },
  "include": ["src", "tests"],
  "exclude": ["dist", "node_modules"]
}
```

`strict: true`는 협상 불가 — 타입 캐스팅으로 Finding 스키마 불일치를 숨기지 않기 위함이다.

## tsup.config.ts

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "cli/index": "src/cli/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  target: "node18",
});
```

## vitest.config.ts

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```

## ESLint (eslint.config.js, flat config)

```javascript
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
);
```

## Prettier (.prettierrc.json)

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100
}
```

## CLI shebang

`src/cli/index.ts` 최상단에 반드시 포함 (npx 실행을 위함):

```typescript
#!/usr/bin/env node
```

tsup 빌드 후 `dist/cli/index.js`가 실행 가능해야 하므로, package.json의 `bin` 필드가 이 경로를 정확히 가리키는지 스캐폴드 완료 시 확인한다.
