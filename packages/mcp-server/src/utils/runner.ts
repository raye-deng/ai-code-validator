import { resolve } from "node:path";
import { V4Scanner, type V4ScanResult } from "@opencodereview/core";
import type { SupportedLanguage, SLALevel } from "@opencodereview/core";

const VALID_LANGUAGES = new Set<string>([
  "typescript", "javascript", "python", "java", "go", "kotlin",
]);

export async function runScan(
  dir: string,
  level: string = "L1",
  languages?: string[],
): Promise<V4ScanResult> {
  const projectRoot = resolve(dir);

  let langList: SupportedLanguage[] | undefined;
  if (languages && languages.length > 0) {
    const valid = languages.filter((l) => VALID_LANGUAGES.has(l.toLowerCase()));
    if (valid.length > 0) {
      langList = valid as SupportedLanguage[];
    }
  }

  const scanner = new V4Scanner({
    projectRoot,
    sla: level as SLALevel,
    languages: langList,
  });

  return scanner.scan();
}
