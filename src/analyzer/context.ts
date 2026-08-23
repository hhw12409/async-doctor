import type { SourceFile } from "ts-morph";
import type { AnalysisContext } from "../core/types.js";

export function createContext(sourceFile: SourceFile, filePath: string): AnalysisContext {
  return { sourceFile, filePath };
}
