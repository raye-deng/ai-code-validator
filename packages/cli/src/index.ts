#!/usr/bin/env node

/**
 * Open Code Review CLI — V4 + V3 Legacy
 *
 * V4 Commands (default):
 *   npx open-code-review scan .
 *   npx open-code-review scan ./src --sla L2
 *   npx open-code-review scan . --format json --locale zh
 *
 * V3 Legacy:
 *   npx open-code-review scan-v3 ./src --threshold 80 --format json
 *
 * Other:
 *   npx open-code-review login
 *   npx open-code-review config show
 *   npx open-code-review config set license AICV-XXXX
 *   npx open-code-review config set cloud-url https://your-cloud.com
 *   npx open-code-review config set api-key your-api-key
 *   npx open-code-review init
 *
 * @since 0.4.0
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { execSync } from 'node:child_process';
import { glob } from 'glob';
import { ConfigManager } from './utils/config-manager.js';
import {
  // V3 detectors (legacy)
  HallucinationDetector,
  LogicGapDetector,
  DuplicationDetector,
  ContextBreakDetector,
  ScoringEngine,
  ReportGenerator,
  PromptBuilder,
  LicenseValidator,
  isValidLicenseFormat,
  // V4 modules
  V4Scanner,
  loadV4Config,
  scoreV4Results,
  createI18n,
  V4TerminalReporter,
  generateV4HTML,
  generateDefaultConfigYaml,
  // Diff support
  parseDiff,
  parseNameStatus,
  filterByDiff,
  getScannableFiles,
  // AI Healer
  AutoFixEngine,
  IDERulesGenerator,
  HealReporter,
} from '@opencodereview/core';
import type {
  ReportFormat,
  FileScore,
  V4ScanResult,
  V4ScoreResult,
  SLALevel,
  Locale,
  DiffResult,
  AggregateScore,
} from '@opencodereview/core';
import { ALL_LLM_PROVIDERS } from '@opencodereview/core';
import type { LLMProviderType } from '@opencodereview/core';

// ─── Constants ─────────────────────────────────────────────────────

const VERSION = '2.0.2';

// ─── Environment Variable Helpers ──────────────────────────────────

function envString(key: string): string | undefined {
  return process.env[key] || undefined;
}

function resolveEnvDefaults() {
  return {
    apiKey: envString('OCR_API_KEY'),
    sla: envString('OCR_SLA') as SLALevel | undefined,
    locale: envString('OCR_LOCALE') as Locale | undefined,
    ollamaUrl: envString('OCR_OLLAMA_URL'),
    ollamaModel: envString('OCR_OLLAMA_MODEL'),
  };
}

// ─── CLI Argument Parsing ──────────────────────────────────────────

interface ParsedArgs {
  command: string;
  subcommand?: string;
  paths: string[];
  // V4 options
  sla?: string;
  locale?: string;
  format?: string;
  configPath?: string;
  offline?: boolean;
  include?: string;
  exclude?: string;
  aiLocalModel?: string;
  aiLocalUrl?: string;
  aiRemoteProvider?: string;
  aiRemoteModel?: string;
  aiRemoteKey?: string;
  noScore?: boolean;
  json?: boolean;
  // Diff options
  diff?: boolean;
  base?: string;
  head?: string;
  // Heal options
  dryRun?: boolean;
  setupIde?: boolean;
  outputPrompts?: string;
  // Short-form AI options (L3)
  provider?: string;
  apiKey?: string;
  model?: string;
  apiBase?: string;
  // V3 options
  threshold: number;
  output?: string;
  healPrompt: boolean;
  license?: string;
  configKey?: string;
  configValue?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const command = args[0] || 'help';
  const paths: string[] = [];
  let threshold = 70;
  let format: string | undefined;
  let output: string | undefined;
  let healPrompt = false;
  let license: string | undefined;
  let subcommand: string | undefined;
  let configKey: string | undefined;
  let configValue: string | undefined;
  let sla: string | undefined;
  let locale: string | undefined;
  let configPath: string | undefined;
  let offline = false;
  let include: string | undefined;
  let exclude: string | undefined;
  let aiLocalModel: string | undefined;
  let aiLocalUrl: string | undefined;
  let aiRemoteProvider: string | undefined;
  let aiRemoteModel: string | undefined;
  let aiRemoteKey: string | undefined;
  let noScore = false;
  let json = false;
  let diff = false;
  let base: string | undefined;
  let head: string | undefined;
  let dryRun = false;
  let setupIde = false;
  let outputPrompts: string | undefined;
  let provider: string | undefined;
  let apiKey: string | undefined;
  let model: string | undefined;
  let apiBase: string | undefined;

  // Handle config subcommand
  if (command === 'config') {
    subcommand = args[1];
    if (subcommand === 'set') {
      configKey = args[2];
      configValue = args[3];
    }
    return {
      command, subcommand, paths, threshold, output, healPrompt, license,
      configKey, configValue, sla, locale, format, configPath, offline,
      include, exclude, aiLocalModel, aiLocalUrl, aiRemoteProvider,
      aiRemoteModel, aiRemoteKey, noScore, json, diff, base, head,
      dryRun, setupIde, outputPrompts, provider, apiKey, model, apiBase,
    };
  }

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--sla':
        sla = args[++i];
        break;
      case '--locale':
        locale = args[++i];
        break;
      case '--config':
        configPath = args[++i];
        break;
      case '--offline':
        offline = true;
        break;
      case '--include':
        include = args[++i];
        break;
      case '--exclude':
        exclude = args[++i];
        break;
      case '--ai-local-model':
        aiLocalModel = args[++i];
        break;
      case '--ai-local-url':
        aiLocalUrl = args[++i];
        break;
      case '--ai-remote-provider':
        aiRemoteProvider = args[++i];
        break;
      case '--ai-remote-model':
        aiRemoteModel = args[++i];
        break;
      case '--ai-remote-key':
        aiRemoteKey = args[++i];
        break;
      case '--provider':
        provider = args[++i];
        break;
      case '--api-key':
        apiKey = args[++i];
        break;
      case '--model':
        model = args[++i];
        break;
      case '--api-base':
        apiBase = args[++i];
        break;
      case '--no-score':
        noScore = true;
        break;
      case '--json':
        json = true;
        break;
      case '--diff':
        diff = true;
        break;
      case '--base':
        base = args[++i];
        break;
      case '--head':
        head = args[++i];
        break;
      case '--threshold':
        threshold = parseInt(args[++i], 10);
        break;
      case '--format':
        format = args[++i];
        break;
      case '--output':
        output = args[++i];
        if (output === 'prompts') {
          outputPrompts = 'prompts';
        }
        break;
      case '--heal':
        healPrompt = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--setup-ide':
        setupIde = true;
        break;
      case '--license':
        license = args[++i];
        break;
      default:
        if (!args[i].startsWith('--')) {
          paths.push(args[i]);
        }
    }
  }

  return {
    command, subcommand, paths, threshold, format, output, healPrompt,
    license, configKey, configValue, sla, locale, configPath, offline,
    include, exclude, aiLocalModel, aiLocalUrl, aiRemoteProvider,
    aiRemoteModel, aiRemoteKey, noScore, json, diff, base, head,
    dryRun, setupIde, outputPrompts, provider, apiKey, model, apiBase,
  };
}

// ─── File Discovery (V3) ──────────────────────────────────────────

async function resolveFiles(patterns: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const pattern of patterns) {
    const matched = await glob(pattern, {
      ignore: ['**/node_modules/**', '**/dist/**', '**/*.d.ts', '**/*.test.*', '**/*.spec.*'],
    });
    files.push(...matched);
  }
  return [...new Set(files)];
}

// ─── License Validation ────────────────────────────────────────────

async function validateLicense(cliLicense?: string): Promise<{ key: string | null; status: string }> {
  const licenseKey = LicenseValidator.resolveLicenseKey({ cli: cliLicense });

  if (!licenseKey) {
    return {
      key: null,
      status: '⚠ No license key found. Run `open-code-review login` to get one.',
    };
  }

  const validator = new LicenseValidator();
  const result = await validator.validate(licenseKey);

  if (result.valid) {
    const maskedKey = licenseKey.replace(/^(AICV-.{4}).+(.{4})$/, '$1-****-****-$2');
    if (result.degraded) {
      return { key: licenseKey, status: `⚠ License: ${maskedKey} (offline mode)` };
    }
    if (result.cached) {
      return { key: licenseKey, status: `✓ License: ${maskedKey} (cached)` };
    }
    return { key: licenseKey, status: `✓ License: ${maskedKey} (verified)` };
  }

  return {
    key: licenseKey,
    status: `⚠ License invalid: ${result.error ?? 'unknown error'}. Continuing anyway (free product).`,
  };
}

// ─── V4 Scan Command ──────────────────────────────────────────────

async function commandV4Scan(parsed: ParsedArgs): Promise<boolean> {
  const envDefaults = resolveEnvDefaults();

  // Determine scan path
  const scanPath = parsed.paths[0] ?? '.';
  const projectRoot = resolve(scanPath);

  // Resolve SLA: CLI > env > config default
  const sla = (parsed.sla?.toUpperCase() ?? envDefaults.sla?.toUpperCase() ?? 'L1') as SLALevel;

  // Resolve locale: CLI > env > config default
  const locale = (parsed.locale ?? envDefaults.locale ?? 'en') as Locale;

  // Resolve output format
  const format = parsed.json ? 'json' : (parsed.format ?? 'terminal');

  // Load config (includes env vars and config file)
  const v4Config = loadV4Config({
    projectRoot,
    overrides: {
      projectRoot,
      sla,
      locale,
      include: parsed.include ? parsed.include.split(',').map(s => s.trim()) : undefined,
      exclude: parsed.exclude ? parsed.exclude.split(',').map(s => s.trim()) : undefined,
      threshold: parsed.threshold,
    },
  });

  // Apply offline mode
  if (parsed.offline) {
    v4Config.registry = undefined;
  }

  // Wire up AI remote config from CLI args (short-form: --provider/--api-key/--model/--api-base)
  const remoteProvider = parsed.provider ?? parsed.aiRemoteProvider;
  const remoteKey = parsed.apiKey ?? parsed.aiRemoteKey ?? envDefaults.apiKey;
  const remoteModel = parsed.model ?? parsed.aiRemoteModel;
  const remoteBaseUrl = parsed.apiBase;

  if (remoteProvider && remoteKey) {
    const validProvider = ALL_LLM_PROVIDERS.includes(remoteProvider as any)
      ? remoteProvider as LLMProviderType
      : undefined;
    if (validProvider) {
      v4Config.ai = v4Config.ai ?? {};
      v4Config.ai.remote = {
        provider: validProvider,
        model: remoteModel ?? 'gpt-4o-mini',
        apiKey: remoteKey,
        baseUrl: remoteBaseUrl,
      };
    }
  }

  // Wire up local LLM config from CLI args
  if (parsed.aiLocalModel || parsed.aiLocalUrl) {
    v4Config.ai = v4Config.ai ?? {};
    v4Config.ai.llm = {
      provider: 'ollama',
      model: parsed.aiLocalModel ?? 'deepseek-coder-v2:16b',
      endpoint: parsed.aiLocalUrl ?? 'http://localhost:11434',
    };
  }

  // Create i18n provider
  const i18n = createI18n(locale);

  // Print header
  if (format === 'terminal') {
    console.error('');
    console.error('  Open Code Review V4');
    console.error(`  SLA: ${sla} | Locale: ${locale}`);
    console.error('');
  }

  // Validate license (non-blocking)
  const { status: licenseStatus } = await validateLicense(parsed.license);
  if (format === 'terminal') {
    console.error(`  ${licenseStatus}`);
    console.error('');
  }

  // ─── Diff Mode ──────────────────────────────────────────────────
  let diffResult: DiffResult | undefined;
  if (parsed.diff) {
    const baseRef = parsed.base ?? 'origin/main';
    const headRef = parsed.head ?? 'HEAD';

    if (format === 'terminal') {
      console.error(`  Diff mode: ${baseRef}...${headRef}`);
    }

    try {
      // Get unified diff for line-level filtering
      const diffText = execSync(`git diff ${baseRef}...${headRef}`, {
        cwd: projectRoot,
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024, // 50MB
      });
      diffResult = parseDiff(diffText);

      // Get changed files and filter to scannable extensions
      const scannableFiles = getScannableFiles(diffResult);

      if (scannableFiles.length === 0) {
        if (format === 'terminal') {
          console.error('  No scannable files changed in diff.');
          console.error('');
        }
        console.log(format === 'json' ? JSON.stringify({ version: '4.0', issues: [], files: [], score: { total: 100, grade: 'A', passed: true } }, null, 2) : 'No scannable files changed.');
        return true;
      }

      if (format === 'terminal') {
        console.error(`  Diff Mode: scanning ${scannableFiles.length} changed file(s)`);
      }

      // Restrict v4Config include patterns to only the changed files
      v4Config.include = scannableFiles.map(f => `**/${f.split('/').pop()}`);
    } catch (err) {
      if (format === 'terminal') {
        console.error(`  ⚠ Diff mode failed (${err instanceof Error ? err.message : 'unknown error'}), falling back to full scan`);
      }
      diffResult = undefined;
    }
  }

  // Create and run V4 scanner
  const scanner = new V4Scanner(v4Config);

  if (format === 'terminal') {
    console.error('  Scanning...');
  }

  const result = await scanner.scan();

  // Apply diff filter if in diff mode
  if (diffResult) {
    const originalCount = result.issues.length;
    result.issues = filterByDiff(result.issues, diffResult);
    if (format === 'terminal') {
      console.error(`  Diff filter: ${originalCount} → ${result.issues.length} issue(s) on changed lines`);
    }
  }

  if (format === 'terminal') {
    console.error(`  Found ${result.issues.length} issue(s) in ${result.files.length} file(s)${diffResult ? ' (diff mode)' : ''}`);
    console.error('');
  }

  // Score results (unless --no-score)
  let scoreResult: V4ScoreResult | undefined;
  if (!parsed.noScore) {
    scoreResult = scoreV4Results(result.issues, result.files.length, v4Config.threshold ?? 70);
  }

  // Output in requested format
  const outputStr = renderV4Output(format, result, scoreResult, i18n);

  if (parsed.output) {
    writeFileSync(parsed.output, outputStr, 'utf-8');
    console.error(`Report written to: ${parsed.output}`);
  } else {
    console.log(outputStr);
  }

  // Return pass/fail
  if (scoreResult) {
    return scoreResult.passed;
  }

  // Without scoring, fail if there are errors
  const hasErrors = result.issues.some(i => i.severity === 'error');
  return !hasErrors;
}

// ─── V4 Output Renderers ──────────────────────────────────────────

function renderV4Output(
  format: string,
  result: V4ScanResult,
  score: V4ScoreResult | undefined,
  i18n: ReturnType<typeof createI18n>,
): string {
  switch (format) {
    case 'json':
      return renderV4Json(result, score);
    case 'sarif':
      return renderV4Sarif(result);
    case 'markdown':
      return renderV4Markdown(result, score);
    case 'html':
      return renderV4Html(result, score);
    case 'terminal':
    default: {
      const reporter = new V4TerminalReporter(i18n);
      return reporter.render(result, score);
    }
  }
}

function renderV4Json(result: V4ScanResult, score?: V4ScoreResult): string {
  const output = {
    version: '4.0',
    projectRoot: result.projectRoot,
    sla: result.sla,
    files: result.files,
    languages: result.languages,
    issues: result.issues,
    score: score ? {
      total: score.totalScore,
      grade: score.grade,
      passed: score.passed,
      threshold: score.threshold,
      dimensions: score.dimensions,
    } : undefined,
    duration: result.durationMs,
    stages: result.stages,
    timestamp: new Date().toISOString(),
  };
  return JSON.stringify(output, null, 2);
}

function renderV4Sarif(result: V4ScanResult): string {
  const sarif = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    version: VERSION,
    runs: [{
      tool: {
        driver: {
          name: 'Open Code Review',
          version: VERSION,
          informationUri: 'https://github.com/raye-deng/open-code-review',
          rules: [...new Set(result.issues.map(i => i.detectorId))].map(id => ({
            id,
            shortDescription: { text: id },
          })),
        },
      },
      results: result.issues.map(issue => ({
        ruleId: issue.detectorId,
        level: issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warning' : 'note',
        message: { text: issue.message },
        locations: [{
          physicalLocation: {
            artifactLocation: {
              uri: issue.file,
              uriBaseId: '%SRCROOT%',
            },
            region: {
              startLine: issue.line,
              endLine: issue.endLine ?? issue.line,
            },
          },
        }],
      })),
    }],
  };
  return JSON.stringify(sarif, null, 2);
}

function renderV4Markdown(result: V4ScanResult, score?: V4ScoreResult): string {
  const lines: string[] = [];
  lines.push('# Open Code Review V4 — Report');
  lines.push('');
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**SLA:** ${result.sla}`);
  lines.push(`**Files:** ${result.files.length}`);
  lines.push(`**Languages:** ${result.languages.join(', ') || 'N/A'}`);
  lines.push(`**Duration:** ${result.durationMs}ms`);
  lines.push('');

  if (score) {
    lines.push('## Score');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Score | ${score.totalScore}/100 |`);
    lines.push(`| Grade | ${score.grade} |`);
    lines.push(`| Status | ${score.passed ? '✅ Passed' : '❌ Failed'} |`);
    lines.push(`| Threshold | ${score.threshold} |`);
    lines.push('');
  }

  if (result.issues.length === 0) {
    lines.push('## Issues');
    lines.push('');
    lines.push('✅ No issues found!');
  } else {
    lines.push(`## Issues (${result.issues.length})`);
    lines.push('');
    lines.push('| Severity | File | Line | Detector | Message |');
    lines.push('|----------|------|------|----------|---------|');
    for (const issue of result.issues) {
      lines.push(`| ${issue.severity} | ${issue.file} | ${issue.line} | ${issue.detectorId} | ${issue.message} |`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function renderV4Html(result: V4ScanResult, score?: V4ScoreResult): string {
  if (score) {
    return generateV4HTML(result, score);
  }
  // Fallback: generate a minimal score for HTML
  const fallbackScore: V4ScoreResult = {
    totalScore: 0, grade: 'N/A', issueCount: result.issues.length,
    passed: false, threshold: 70,
    dimensions: {
      faithfulness: { name: 'AI Faithfulness', maxScore: 25, score: 25, issueCount: 0, percentage: 100 },
      freshness: { name: 'Code Freshness', maxScore: 25, score: 25, issueCount: 0, percentage: 100 },
      coherence: { name: 'Context Coherence', maxScore: 25, score: 25, issueCount: 0, percentage: 100 },
      quality: { name: 'Implementation Quality', maxScore: 25, score: 25, issueCount: 0, percentage: 100 },
    },
  };
  return generateV4HTML(result, fallbackScore);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── V3 Legacy Scan Command ────────────────────────────────────────

async function commandScanV3(
  paths: string[],
  threshold: number,
  format: ReportFormat,
  output?: string,
  healPrompt?: boolean,
  cliLicense?: string,
): Promise<boolean> {
  const projectRoot = resolve('.');

  const { status: licenseStatus } = await validateLicense(cliLicense);
  console.error(licenseStatus);
  console.error('');

  // Expand directory paths to globs
  const expandedPaths: string[] = [];
  if (paths.length === 0) {
    expandedPaths.push('src/**/*.ts', 'src/**/*.js', 'src/**/*.tsx', 'src/**/*.jsx');
  } else {
    for (const p of paths) {
      try {
        if (existsSync(p) && statSync(p).isDirectory()) {
          expandedPaths.push(
            `${p}/**/*.ts`, `${p}/**/*.js`,
            `${p}/**/*.tsx`, `${p}/**/*.jsx`,
          );
        } else {
          expandedPaths.push(p);
        }
      } catch {
        expandedPaths.push(p);
      }
    }
  }

  const files = await resolveFiles(expandedPaths);

  if (files.length === 0) {
    console.error('No files found matching the specified patterns.');
    process.exit(1);
  }

  console.error(`[V3] Scanning ${files.length} file(s)...`);

  const hallucinationDetector = new HallucinationDetector({ projectRoot });
  const logicGapDetector = new LogicGapDetector();
  const duplicationDetector = new DuplicationDetector();
  const contextBreakDetector = new ContextBreakDetector();
  const scoringEngine = new ScoringEngine(threshold);

  const fileScores: FileScore[] = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf-8');
    const relPath = relative(projectRoot, resolve(file));

    const halResult = hallucinationDetector.analyze(file, source);
    const logicResult = logicGapDetector.analyze(file, source);
    const dupResult = duplicationDetector.analyze(file, source);
    const ctxResult = contextBreakDetector.analyze(file, source);

    const score = scoringEngine.scoreFile(relPath, halResult, logicResult, dupResult, ctxResult);
    fileScores.push(score);
  }

  const aggregate = scoringEngine.aggregate(fileScores);
  const reporter = new ReportGenerator();
  const report = reporter.generate(aggregate, format);

  if (output) {
    writeFileSync(output, report, 'utf-8');
    console.error(`Report written to: ${output}`);
  } else {
    console.log(report);
  }

  if (healPrompt) {
    const builder = new PromptBuilder();
    const prompt = builder.buildCombinedPrompt(aggregate);
    const healPath = output ? output.replace(/\.\w+$/, '.heal.md') : 'ai-heal-prompt.md';
    writeFileSync(healPath, prompt, 'utf-8');
    console.error(`AI heal prompt written to: ${healPath}`);
  }

  return aggregate.passed;
}

// ─── Init Command ──────────────────────────────────────────────────

async function commandInit(): Promise<void> {
  const configPath = resolve('.ocrrc.yml');
  if (existsSync(configPath)) {
    console.log(`  Configuration file already exists: ${configPath}`);
    console.log('  Delete it first if you want to regenerate.');
    return;
  }

  writeFileSync(configPath, generateDefaultConfigYaml(), 'utf-8');
  console.log(`  ✓ Created ${configPath}`);
  console.log('  Edit the file to customize your scan settings.');
}

// ─── Login Command ─────────────────────────────────────────────────

async function commandLogin(): Promise<void> {
  console.log('');
  console.log('  ┌──────────────────────────────────────────┐');
  console.log('  │   Open Code Review — License Setup       │');
  console.log('  └──────────────────────────────────────────┘');
  console.log('');

  const existingKey = LicenseValidator.resolveLicenseKey();
  if (existingKey && isValidLicenseFormat(existingKey)) {
    const maskedKey = existingKey.replace(/^(AICV-.{4}).+(.{4})$/, '$1-****-****-$2');
    console.log(`  You already have a license key: ${maskedKey}`);
    console.log('');

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question('  Replace with a new key? (y/N): ', resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== 'y') {
      console.log('  Keeping existing license key.');
      return;
    }
    console.log('');
  }

  const portalUrl = 'https://codes.evallab.ai/register';
  console.log('  To get a license key:');
  console.log('');
  console.log(`  1. Visit: ${portalUrl}`);
  console.log('  2. Sign up with GitHub or email');
  console.log('  3. Copy your license key from the dashboard');
  console.log('');

  try {
    const { exec: execCb } = await import('node:child_process');
    const openCmd = process.platform === 'darwin' ? 'open' :
                    process.platform === 'win32' ? 'start' : 'xdg-open';
    execCb(`${openCmd} ${portalUrl}`, () => {});
    console.log('  (Opening browser...)');
    console.log('');
  } catch {
    // Browser opening failed
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const licenseKey = await new Promise<string>((resolve) => {
    rl.question('  Paste your license key: ', resolve);
  });
  rl.close();

  const trimmedKey = licenseKey.trim().toUpperCase();

  if (!trimmedKey) {
    console.log('');
    console.log('  No key entered. You can set it later with:');
    console.log('    open-code-review config set license YOUR-KEY');
    return;
  }

  if (!isValidLicenseFormat(trimmedKey)) {
    console.error('');
    console.error(`  ✗ Invalid license key format: ${trimmedKey}`);
    console.error('    Expected format: AICV-XXXX-XXXX-XXXX-XXXX');
    process.exit(1);
  }

  console.log('');
  console.log('  Validating...');
  const validator = new LicenseValidator();
  const result = await validator.validate(trimmedKey);

  if (result.valid) {
    LicenseValidator.saveLicenseKey(trimmedKey);
    console.log('  ✓ License key saved to ~/.aicv/license');
    console.log('');
    console.log('  You\'re all set! Run `open-code-review scan .` to get started.');
  } else {
    console.error(`  ⚠ Validation warning: ${result.error ?? 'could not verify'}`);
    console.log('  Saving anyway (free product).');
    LicenseValidator.saveLicenseKey(trimmedKey);
    console.log('  ✓ License key saved to ~/.aicv/license');
  }
}

// ─── Config Command ────────────────────────────────────────────────

async function commandConfig(subcommand?: string, key?: string, value?: string): Promise<void> {
  const aicvDir = join(homedir(), '.aicv');

  switch (subcommand) {
    case 'show': {
      console.log('');
      console.log('  Open Code Review — Configuration');
      console.log('  ─────────────────────────────────');

      const licenseKey = LicenseValidator.resolveLicenseKey();
      if (licenseKey) {
        const maskedKey = licenseKey.replace(/^(AICV-.{4}).+(.{4})$/, '$1-****-****-$2');
        console.log(`  License:     ${maskedKey}`);
      } else {
        console.log('  License:     (not set)');
      }

      const configFiles = ['.ocrrc.yml', '.ocrrc.yaml', '.aicv.yml', '.aicv.yaml'];
      let foundConfig = false;
      for (const cf of configFiles) {
        if (existsSync(cf)) {
          console.log(`  Config file: ${resolve(cf)}`);
          foundConfig = true;
          break;
        }
      }
      if (!foundConfig) {
        console.log('  Config file: (none found in current directory)');
      }

      const globalConfig = join(aicvDir, 'config.yml');
      if (existsSync(globalConfig)) {
        console.log(`  Global:      ${globalConfig}`);
      } else {
        console.log('  Global:      (not set)');
      }

      const cachePath = join(aicvDir, 'license-cache.json');
      if (existsSync(cachePath)) {
        try {
          const cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
          const age = Date.now() - cache.timestamp;
          const hoursAgo = Math.round(age / (60 * 60 * 1000));
          console.log(`  Cache:       valid (${hoursAgo}h old)`);
        } catch {
          console.log('  Cache:       (corrupt)');
        }
      } else {
        console.log('  Cache:       (empty)');
      }

      // Show cloud config
      const configManager = new ConfigManager();
      const cloudUrl = configManager.get('cloudUrl');
      const apiKey = configManager.get('apiKey');
      
      if (cloudUrl) {
        console.log(`  Cloud URL:   ${cloudUrl}`);
      } else {
        console.log('  Cloud URL:   (not set)');
      }
      
      if (apiKey) {
        const maskedKey = apiKey.replace(/^(.{8}).*(.{4})$/, '$1...$2');
        console.log(`  API Key:     ${maskedKey}`);
      } else {
        console.log('  API Key:     (not set)');
      }

      console.log('');
      break;
    }

    case 'set': {
      if (!key) {
        console.error('Usage: open-code-review config set <key> <value>');
        console.error('Available keys: license, cloud-url, api-key');
        process.exit(1);
      }

      switch (key) {
        case 'license': {
          if (!value) {
            console.error('Usage: open-code-review config set license AICV-XXXX-XXXX-XXXX-XXXX');
            process.exit(1);
          }
          const trimmed = value.trim().toUpperCase();
          if (!isValidLicenseFormat(trimmed)) {
            console.error(`Invalid license key format: ${trimmed}`);
            console.error('Expected format: AICV-XXXX-XXXX-XXXX-XXXX');
            process.exit(1);
          }
          LicenseValidator.saveLicenseKey(trimmed);
          console.log('✓ License key saved to ~/.aicv/license');
          break;
        }
        case 'cloud-url': {
          if (!value) {
            console.error('Usage: open-code-review config set cloud-url https://your-cloud.com');
            process.exit(1);
          }
          const configManager = new ConfigManager();
          configManager.set('cloudUrl', value);
          console.log(`✓ Cloud URL set to: ${value}`);
          break;
        }
        case 'api-key': {
          if (!value) {
            console.error('Usage: open-code-review config set api-key your-api-key');
            process.exit(1);
          }
          const configManager = new ConfigManager();
          configManager.set('apiKey', value);
          console.log('✓ API key saved');
          break;
        }
        default:
          console.error(`Unknown config key: ${key}`);
          console.error('Available keys: license, cloud-url, api-key');
          process.exit(1);
      }
      break;
    }

    default: {
      await commandConfig('show');
      break;
    }
  }
}

// ─── Heal Command ───────────────────────────────────────────────────

async function commandHeal(parsed: ParsedArgs): Promise<boolean> {
  const envDefaults = resolveEnvDefaults();
  const scanPath = parsed.paths[0] ?? '.';
  const projectRoot = resolve(scanPath);
  const sla = (parsed.sla?.toUpperCase() ?? envDefaults.sla?.toUpperCase() ?? 'L1') as SLALevel;

  console.error('');
  console.error('  Open Code Review — AI Auto-Fix');
  console.error(`  Path: ${projectRoot}`);
  console.error(`  SLA: ${sla}`);
  console.error('');

  if (parsed.dryRun) {
    console.error('  Mode: DRY RUN (no files will be modified)');
  }

  // Step 1: Run V4 scan (reusing V3 legacy for AggregateScore — needed by heal)
  const expandedPaths: string[] = [];
  if (parsed.paths.length === 0) {
    expandedPaths.push('src/**/*.ts', 'src/**/*.js', 'src/**/*.tsx', 'src/**/*.jsx',
      '**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx',
      '**/*.py', '**/*.java', '**/*.go', '**/*.kt');
  } else {
    for (const p of parsed.paths) {
      expandedPaths.push(`${p}/**/*.ts`, `${p}/**/*.js`, `${p}/**/*.tsx`, `${p}/**/*.jsx`,
        `${p}/**/*.py`, `${p}/**/*.java`, `${p}/**/*.go`, `${p}/**/*.kt`);
    }
  }

  const files = await resolveFiles(expandedPaths);
  if (files.length === 0) {
    console.error('  No files found to scan.');
    return true;
  }

  console.error(`  Scanning ${files.length} file(s)...`);

  const hallucinationDetector = new HallucinationDetector({ projectRoot });
  const logicGapDetector = new LogicGapDetector();
  const duplicationDetector = new DuplicationDetector();
  const contextBreakDetector = new ContextBreakDetector();
  const scoringEngine = new ScoringEngine(parsed.threshold);

  const fileScores: FileScore[] = [];
  for (const file of files) {
    try {
      const source = readFileSync(file, 'utf-8');
      const relPath = relative(projectRoot, resolve(file));
      const halResult = hallucinationDetector.analyze(file, source);
      const logicResult = logicGapDetector.analyze(file, source);
      const dupResult = duplicationDetector.analyze(file, source);
      const ctxResult = contextBreakDetector.analyze(file, source);
      const score = scoringEngine.scoreFile(relPath, halResult, logicResult, dupResult, ctxResult);
      fileScores.push(score);
    } catch {
      // Skip unreadable files
    }
  }

  const aggregate = scoringEngine.aggregate(fileScores);
  console.error(`  Scan complete: ${aggregate.overallScore}/100 (Grade: ${aggregate.grade})`);
  console.error(`  Files with issues: ${aggregate.failedFiles}`);
  console.error('');

  // Step 2: Filter files needing healing
  const threshold = 95;
  const filesToHeal = aggregate.files.filter(f => f.totalScore < threshold);
  if (filesToHeal.length === 0) {
    console.error('  ✅ All files passed! No healing needed.');
    if (parsed.setupIde) {
      await generateIDERules(aggregate, projectRoot);
    }
    return true;
  }

  console.error(`  Healing ${filesToHeal.length} file(s)...`);

  // Step 3: Run auto-fix engine
  const engine = new AutoFixEngine();
  const healReport = await engine.heal(aggregate, {
    projectRoot,
    threshold,
    dryRun: parsed.dryRun,
    provider: (parsed.aiRemoteProvider as 'ollama' | 'openai') || undefined,
    ollamaUrl: parsed.aiLocalUrl || envDefaults.ollamaUrl,
    ollamaModel: parsed.aiLocalModel || envDefaults.ollamaModel,
    openaiKey: parsed.aiRemoteKey || envDefaults.apiKey,
    openaiModel: parsed.aiRemoteModel || undefined,
    strategy: parsed.aiRemoteProvider ? 'remote-first' : 'local-first',
    setupIde: parsed.setupIde,
    outputPrompts: parsed.outputPrompts,
  });

  // Step 4: Generate report
  const reporter = new HealReporter();
  const reportMarkdown = reporter.generateReport(healReport, { includeDiff: true });

  if (parsed.output && parsed.output !== 'prompts') {
    writeFileSync(parsed.output, reportMarkdown, 'utf-8');
    console.error(`  Report written to: ${parsed.output}`);
  } else {
    console.log(reportMarkdown);
  }

  // Generate SARIF
  const sarifDir = parsed.output ? resolve(parsed.output, '..') : projectRoot;
  const sarifPath = resolve(sarifDir, 'ocr-heal-report.sarif.json');
  try {
    writeFileSync(sarifPath, reporter.generateSARIF(healReport, aggregate), 'utf-8');
    console.error(`  SARIF report: ${sarifPath}`);
  } catch {
    // Ignore SARIF write errors
  }

  // Step 5: IDE rules
  if (parsed.setupIde) {
    await generateIDERules(aggregate, projectRoot, healReport);
  }

  // Summary
  console.error('');
  if (healReport.filesHealed > 0) {
    console.error(`  ✅ Healed ${healReport.filesHealed} file(s), ${healReport.issuesFixed} issue(s) fixed`);
  } else {
    console.error(`  ⚠ No files were healed (check errors above)`);
  }
  if (healReport.errors.length > 0) {
    console.error(`  ⚠ ${healReport.errors.length} error(s) encountered`);
  }

  return healReport.filesToHeal === 0;
}

/**
 * Generate IDE rule files from scan report.
 */
async function generateIDERules(
  aggregate: AggregateScore,
  projectRoot: string,
  healReport?: import('@opencodereview/core').HealReport,
): Promise<void> {
  console.error('');
  console.error('  Generating IDE rule files...');

  const generator = new IDERulesGenerator();
  const writtenPaths = generator.writeAll({
    projectRoot,
    report: aggregate,
    healReport: healReport as any,
  });

  for (const path of writtenPaths) {
    console.error(`  ✓ ${path}`);
  }
}

// ─── Setup Command (IDE rules only) ────────────────────────────────

async function commandSetup(parsed: ParsedArgs): Promise<boolean> {
  const scanPath = parsed.paths[0] ?? '.';
  const projectRoot = resolve(scanPath);

  console.error('');
  console.error('  Open Code Review — IDE Setup');
  console.error(`  Path: ${projectRoot}`);
  console.error('');

  // Run a quick scan to get the report
  const expandedPaths: string[] = [
    'src/**/*.ts', 'src/**/*.js', 'src/**/*.tsx', 'src/**/*.jsx',
    '**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx',
    '**/*.py', '**/*.java', '**/*.go', '**/*.kt',
  ];

  const files = await resolveFiles(expandedPaths);
  if (files.length === 0) {
    console.error('  No files found to scan.');
    return true;
  }

  console.error(`  Scanning ${files.length} file(s)...`);

  const hallucinationDetector = new HallucinationDetector({ projectRoot });
  const logicGapDetector = new LogicGapDetector();
  const duplicationDetector = new DuplicationDetector();
  const contextBreakDetector = new ContextBreakDetector();
  const scoringEngine = new ScoringEngine(parsed.threshold);

  const fileScores: FileScore[] = [];
  for (const file of files) {
    try {
      const source = readFileSync(file, 'utf-8');
      const relPath = relative(projectRoot, resolve(file));
      const halResult = hallucinationDetector.analyze(file, source);
      const logicResult = logicGapDetector.analyze(file, source);
      const dupResult = duplicationDetector.analyze(file, source);
      const ctxResult = contextBreakDetector.analyze(file, source);
      const score = scoringEngine.scoreFile(relPath, halResult, logicResult, dupResult, ctxResult);
      fileScores.push(score);
    } catch {
      // Skip unreadable files
    }
  }

  const aggregate = scoringEngine.aggregate(fileScores);
  console.error(`  Scan complete: ${aggregate.overallScore}/100 (Grade: ${aggregate.grade})`);
  console.error('');

  await generateIDERules(aggregate, projectRoot);

  console.error('');
  console.error('  ✅ IDE rule files generated!');
  console.error('  AI coding assistants will now follow your project rules.');
  return true;
}

// ─── Help ──────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
Open Code Review — Quality gate for AI-generated code

USAGE:
  open-code-review <command> [options]

COMMANDS:
  scan [path]           Scan a project for AI-generated code defects (V4, default)
  heal [path]           Scan + auto-fix issues using AI
  setup [path]          Generate IDE rule files (Cursor/Copilot/Augment)
  scan-v3 [paths...]    Legacy V3 scan
  init                  Create .ocrrc.yml configuration file
  login                 Set up license key (opens Portal)
  config [show|set]     View or update configuration
  help                  Show this help message

HEAL OPTIONS:
  --dry-run             Preview fixes without modifying files
  --sla <level>         SLA level: L1 (fast), L2 (standard), L3 (deep) [default: L1]
  --setup-ide           Generate IDE rule files after healing
  --output <path>       Write report to file; use "prompts" to output prompt files only
  --provider <p>        Remote AI provider: openai, anthropic, glm
  --ai-remote-provider  Remote AI provider (alias for --provider)
  --ai-remote-model <m> Remote AI model name
  --ai-remote-key <key> Remote AI API key (or env: OCR_API_KEY)
  --ai-local-model <m>  Ollama model name
  --ai-local-url <url>  Ollama base URL [default: http://localhost:11434]

V4 SCAN OPTIONS:
  --diff                Enable diff-only scanning (scan changed files only)
  --base <ref>          Base branch/commit for diff (default: origin/main)
  --head <ref>          Head branch/commit for diff (default: HEAD)
  --sla <level>         SLA level: L1 (fast), L2 (standard), L3 (deep) [default: L1]
  --locale <locale>     Output language: en, zh [default: en]
  --format <format>     Output format: terminal, json, sarif, markdown, html [default: terminal]
  --config <path>       Config file path
  --offline             Skip registry verification (offline mode)
  --include <patterns>  File patterns to include (comma-separated)
  --exclude <patterns>  File patterns to exclude (comma-separated)
  --ai-local-model <m>  Ollama model name for L2 scans
  --ai-local-url <url>  Ollama base URL [default: http://localhost:11434]
  --ai-remote-provider  Remote AI provider: openai, anthropic, glm
  --ai-remote-model <m> Remote AI model name
  --ai-remote-key <key> Remote AI API key (or env: OCR_API_KEY)
  --provider <p>        Remote AI provider shorthand: openai, anthropic, glm
  --api-key <key>       Remote AI API key shorthand
  --model <m>           Remote AI model name shorthand
  --api-base <url>      Remote AI API base URL (for GLM, etc.)
  --no-score            Skip scoring
  --json                Output as JSON (shorthand for --format json)
  --output <path>       Write report to file instead of stdout
  --license <key>       License key (AICV-XXXX-XXXX-XXXX-XXXX)

V3 LEGACY OPTIONS:
  --threshold <n>       Minimum score to pass (default: 70)
  --format <fmt>        Output format: terminal, json, markdown
  --heal                Generate AI self-heal prompt file

ENVIRONMENT VARIABLES:
  OCR_API_KEY           Remote AI API key
  OCR_SLA               Default SLA level
  OCR_LOCALE            Default locale
  OCR_OLLAMA_URL        Ollama base URL
  OCR_OLLAMA_MODEL      Ollama model

EXAMPLES:
  open-code-review scan .
  open-code-review scan ./src --sla L2 --locale zh
  open-code-review scan . --format json --output report.json
  open-code-review scan . --offline --no-score
  open-code-review scan . --diff                          # scan only changed files vs origin/main
  open-code-review scan . --diff --base develop --head HEAD
  open-code-review scan . --sla L3 --provider glm --model pony-alpha-2 --api-key YOUR_KEY --api-base https://open.bigmodel.cn/api/coding/paas/v4
  open-code-review heal .                                 # scan + auto-fix
  open-code-review heal . --dry-run                       # preview fixes only
  open-code-review heal . --sla L2 --setup-ide            # fix + generate IDE rules
  open-code-review heal . --output prompts                # output prompt files for Cursor/Copilot
  open-code-review setup .                                # generate IDE rules only
  open-code-review scan-v3 ./src --threshold 80
  open-code-review init
  open-code-review login
`);
}

// ─── Entry Point ───────────────────────────────────────────────────

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  switch (parsed.command) {
    case 'scan': {
      const passed = await commandV4Scan(parsed);
      process.exit(passed ? 0 : 1);
      break;
    }

    case 'heal': {
      const passed = await commandHeal(parsed);
      process.exit(passed ? 0 : 1);
      break;
    }

    case 'setup': {
      const passed = await commandSetup(parsed);
      process.exit(passed ? 0 : 1);
      break;
    }

    case 'scan-v3': {
      const passed = await commandScanV3(
        parsed.paths,
        parsed.threshold,
        (parsed.format ?? 'terminal') as ReportFormat,
        parsed.output,
        parsed.healPrompt,
        parsed.license,
      );
      process.exit(passed ? 0 : 1);
      break;
    }

    case 'init': {
      await commandInit();
      process.exit(0);
      break;
    }

    case 'login': {
      await commandLogin();
      process.exit(0);
      break;
    }

    case 'config': {
      await commandConfig(parsed.subcommand, parsed.configKey, parsed.configValue);
      process.exit(0);
      break;
    }

    case 'help':
    case '--help':
    case '-h':
      printHelp();
      process.exit(0);
      break;

    case '--version':
    case '-v': {
      console.log(VERSION);
      process.exit(0);
      break;
    }

    default:
      console.error(`Unknown command: ${parsed.command}`);
      console.error('Run `open-code-review help` for usage.');
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});