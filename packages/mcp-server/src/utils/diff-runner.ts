import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { V4Scanner, parseDiff, getScannableFiles, filterByDiff, type V4ScanResult, type DiffResult } from "@opencodereview/core";
import type { SLALevel } from "@opencodereview/core";

export interface DiffScanResult {
  result: V4ScanResult;
  diffResult: DiffResult;
}

export async function runDiffScan(
  repoPath: string,
  base: string,
  head: string,
  level: string = "L1",
): Promise<DiffScanResult> {
  const projectRoot = resolve(repoPath);

  const diffText = execSync(`git diff ${base}...${head}`, {
    cwd: projectRoot,
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
  });

  const diffResult = parseDiff(diffText);
  const scannableFiles = getScannableFiles(diffResult);

  if (scannableFiles.length === 0) {
    const empty: V4ScanResult = {
      issues: [],
      codeUnits: [],
      files: [],
      languages: [],
      durationMs: 0,
      stages: { discovery: 0, parsing: 0, detection: 0 },
      projectRoot,
      sla: level as SLALevel,
    };
    return { result: empty, diffResult };
  }

  const scanner = new V4Scanner({
    projectRoot,
    sla: level as SLALevel,
    include: scannableFiles.map((f) => `**/${f.split("/").pop()}`),
  });

  const result = await scanner.scan();
  result.issues = filterByDiff(result.issues, diffResult);

  return { result, diffResult };
}
