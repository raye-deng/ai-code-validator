/**
 * AI Scan Pipeline Orchestrator
 *
 * Coordinates the two-stage AI scan pipeline:
 * - Stage 0: Structural detectors (always runs, passed in)
 * - Stage 1: Embedding recall (L2+)
 * - Stage 2: LLM deep scan (L3)
 *
 * @since 0.4.0
 */

import type { CodeUnit } from '../../ir/types.js';
import type { DetectorResult } from '../../detectors/v4/types.js';
import type {
  AIConfig,
  AIPipelineResult,
  EmbeddingProvider,
  LLMProvider,
  ScanStageResult,
  SLALevel,
} from './types.js';
import { LocalEmbeddingProvider, cosineSimilarity } from './embedding/index.js';
import { OpenAIEmbeddingProvider } from './embedding/index.js';
import { OllamaEmbeddingProvider } from './embedding/index.js';
import { OllamaLLMProvider } from './llm/index.js';
import { OpenAILLMProvider } from './llm/index.js';
import { AnthropicLLMProvider } from './llm/index.js';
import {
  DEFECT_PATTERNS,
  getPatternText,
  getPatternsForLanguage,
} from './patterns/index.js';

// ─── LLM Response Parser ───────────────────────────────────────────

/** Structured issue parsed from LLM JSON response. */
export interface ParsedLLMIssue {
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  category: string;
}

/**
 * Parse LLM JSON response into structured issues.
 * Handles markdown code fences and malformed JSON gracefully.
 */
function parseLLMResponse(content: string): ParsedLLMIssue[] {
  try {
    // Strip markdown code fences if present
    let jsonText = content.trim();
    if (jsonText.startsWith('```')) {
      const lines = jsonText.split('\n');
      // Remove first and last line if they're code fence markers
      if (lines[0].startsWith('```')) lines.shift();
      if (lines[lines.length - 1].trim() === '```') lines.pop();
      jsonText = lines.join('\n');
    }

    const parsed = JSON.parse(jsonText);

    // Handle { issues: [...] } wrapper
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues
      : Array.isArray(parsed)
        ? parsed
        : [];

    return issues
      .filter(
        (issue: unknown): issue is ParsedLLMIssue =>
          typeof issue === 'object' &&
          issue !== null &&
          'line' in issue &&
          'message' in issue,
      )
      .map((issue: Record<string, unknown>) => ({
        line: Math.max(1, Math.floor(Number(issue.line)) || 1),
        severity: normalizeSeverity(issue.severity as string),
        message: String(issue.message),
        category: (issue.category as string) ?? 'implementation',
      }));
  } catch {
    return [];
  }
}

function normalizeSeverity(
  severity: string | undefined,
): 'error' | 'warning' | 'info' {
  const s = (severity ?? 'info').toLowerCase();
  if (s === 'error' || s === 'critical') return 'error';
  if (s === 'warning' || s === 'warn') return 'warning';
  return 'info';
}

function normalizeCategory(category: string): DetectorResult['category'] {
  const c = category.toLowerCase();
  if (c.includes('faithful') || c.includes('hallucin')) return 'ai-faithfulness';
  if (c.includes('fresh') || c.includes('stale') || c.includes('deprecat'))
    return 'code-freshness';
  if (c.includes('coher') || c.includes('context')) return 'context-coherence';
  return 'implementation';
}

// ─── AI Scan Pipeline ──────────────────────────────────────────────

/**
 * AI Scan Pipeline orchestrator.
 *
 * Runs the two-stage AI analysis based on SLA level configuration.
 */
export class AIScanPipeline {
  private readonly maxLLMBlocks: number;
  private readonly similarityThreshold: number;

  constructor(private config: AIConfig) {
    this.maxLLMBlocks = config.maxLLMBlocks ?? 20;
    this.similarityThreshold = config.similarityThreshold ?? 0.7;
  }

  /**
   * Run the full scan pipeline.
   *
   * @param units CodeUnits from parsing
   * @param structuralResults Results from structural detectors (V4 detectors)
   * @returns Combined results from all stages
   */
  async scan(
    units: CodeUnit[],
    structuralResults: DetectorResult[],
  ): Promise<AIPipelineResult> {
    const stages: ScanStageResult[] = [];
    const totalStartTime = Date.now();

    // Stage 0: Structural (already done, just include)
    stages.push({
      stage: 'structural',
      issues: structuralResults,
      durationMs: 0,
    });

    // L1 stops here
    if (this.config.sla === 'L1') {
      return this.buildResult(stages, totalStartTime);
    }

    // Stage 1: Embedding recall (L2 and L3)
    const embeddingResults = await this.runEmbeddingStage(units);
    stages.push(embeddingResults);

    // Stage 2: LLM deep scan (L3 only)
    if (this.config.sla === 'L3') {
      const suspiciousBlocks = this.getSuspiciousBlocks(units, embeddingResults);
      const llmResults = await this.runLLMStage(suspiciousBlocks);
      stages.push(llmResults);
    }

    return this.buildResult(stages, totalStartTime);
  }

  /**
   * Build the final result object.
   */
  private buildResult(
    stages: ScanStageResult[],
    startTime: number,
  ): AIPipelineResult {
    const totalIssues = stages.reduce((sum, s) => sum + s.issues.length, 0);
    const totalDurationMs = Date.now() - startTime;

    return {
      stages,
      totalIssues,
      totalDurationMs,
      slaLevel: this.config.sla,
    };
  }

  /**
   * Stage 1: Run embedding-based recall to find suspicious code blocks.
   */
  private async runEmbeddingStage(
    units: CodeUnit[],
  ): Promise<ScanStageResult> {
    const startTime = Date.now();

    if (units.length === 0) {
      return { stage: 'embedding', issues: [], durationMs: 0 };
    }

    // Create embedding provider
    const embeddingProvider = this.createEmbeddingProvider();

    // Build corpus: pattern descriptions + code unit sources
    const patternTexts = DEFECT_PATTERNS.map(getPatternText);
    const codeTexts = units.map(u => this.buildCodeText(u));
    const allTexts = [...patternTexts, ...codeTexts];

    // Build vocabulary and generate embeddings
    if (embeddingProvider instanceof LocalEmbeddingProvider) {
      embeddingProvider.buildVocabulary(allTexts);
    }

    const embeddings = await embeddingProvider.embed(allTexts);

    // Split embeddings back into patterns and code
    const patternEmbeddings = embeddings.slice(0, patternTexts.length);
    const codeEmbeddings = embeddings.slice(patternTexts.length);

    // Find suspicious blocks by comparing code embeddings to pattern embeddings
    const issues: DetectorResult[] = [];

    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      const codeEmb = codeEmbeddings[i];
      if (!codeEmb) continue;

      // Get patterns applicable to this language
      const applicablePatterns = getPatternsForLanguage(unit.language);

      // Find matching patterns
      const matches: Array<{ patternIdx: number; similarity: number }> = [];
      for (const pattern of applicablePatterns) {
        const patternIdx = DEFECT_PATTERNS.indexOf(pattern);
        if (patternIdx === -1) continue;

        const patternEmb = patternEmbeddings[patternIdx];
        if (!patternEmb) continue;

        const similarity = cosineSimilarity(codeEmb, patternEmb);
        if (similarity >= this.similarityThreshold) {
          matches.push({ patternIdx, similarity });
        }
      }

      // Create issues for top matches
      for (const match of matches.slice(0, 3)) {
        const pattern = DEFECT_PATTERNS[match.patternIdx];
        if (!pattern) continue;

        issues.push({
          detectorId: 'embedding-recall',
          severity: pattern.severity,
          category: pattern.category,
          messageKey: `ai.embedding.${pattern.id}`,
          message: pattern.description,
          file: unit.file,
          line: unit.location.startLine + 1, // Convert to 1-based
          confidence: match.similarity,
          metadata: {
            patternId: pattern.id,
            similarity: match.similarity,
          },
        });
      }
    }

    return {
      stage: 'embedding',
      issues,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Stage 2: Run LLM deep scan on suspicious blocks.
   */
  private async runLLMStage(
    suspiciousUnits: CodeUnit[],
  ): Promise<ScanStageResult> {
    const startTime = Date.now();
    let totalTokens = 0;

    if (suspiciousUnits.length === 0) {
      return { stage: 'llm', issues: [], durationMs: 0, tokensUsed: 0 };
    }

    // Create LLM provider (local first, fallback to remote)
    const llmProvider = await this.createLLMProvider();
    if (!llmProvider) {
      return { stage: 'llm', issues: [], durationMs: Date.now() - startTime, tokensUsed: 0 };
    }

    const issues: DetectorResult[] = [];

    // Process suspicious blocks (limited by maxLLMBlocks)
    const blocksToAnalyze = suspiciousUnits.slice(0, this.maxLLMBlocks);

    for (const unit of blocksToAnalyze) {
      try {
        const prompt = this.buildPrompt(unit);
        const response = await llmProvider.complete(prompt, {
          maxTokens: 2000,
          temperature: 0.1,
          system: LLM_SYSTEM_PROMPT,
        });

        if (response.usage) {
          totalTokens += response.usage.total;
        }

        // Parse LLM response
        const llmIssues = parseLLMResponse(response.content);

        // Convert to DetectorResults
        for (const issue of llmIssues) {
          issues.push({
            detectorId: 'llm-deep-scan',
            severity: issue.severity,
            category: normalizeCategory(issue.category),
            messageKey: 'ai.llm.detected',
            message: issue.message,
            file: unit.file,
            line: issue.line,
            confidence: 0.8, // LLM issues have high confidence
            metadata: {
              source: 'llm',
            },
          });
        }
      } catch {
        // Graceful degradation: skip this block on error
        continue;
      }
    }

    return {
      stage: 'llm',
      issues,
      durationMs: Date.now() - startTime,
      tokensUsed: totalTokens,
    };
  }

  /**
   * Get suspicious blocks from embedding results.
   * Returns units that have embedding matches above threshold.
   */
  private getSuspiciousBlocks(
    units: CodeUnit[],
    embeddingResults: ScanStageResult,
  ): CodeUnit[] {
    // Get unique file paths with embedding issues
    const suspiciousFiles = new Set(
      embeddingResults.issues
        .filter(i => i.confidence >= this.similarityThreshold)
        .map(i => i.file),
    );

    // Return units from suspicious files
    return units.filter(u => suspiciousFiles.has(u.file));
  }

  /**
   * Create embedding provider based on configuration.
   */
  private createEmbeddingProvider(): EmbeddingProvider {
    const embeddingConfig = this.config.embedding;

    if (embeddingConfig?.provider === 'ollama') {
      return new OllamaEmbeddingProvider(
        embeddingConfig.model ?? 'nomic-embed-text',
        embeddingConfig.baseUrl ?? this.config.local?.baseUrl ?? 'http://localhost:11434',
      );
    }

    if (embeddingConfig?.provider === 'openai' && this.config.remote?.apiKey) {
      return new OpenAIEmbeddingProvider(
        this.config.remote.apiKey,
        embeddingConfig.model ?? 'text-embedding-3-small',
      );
    }

    // Default to local TF-IDF
    return new LocalEmbeddingProvider(512);
  }

  /**
   * Create LLM provider based on configuration.
   * Prefers local (Ollama), falls back to remote.
   */
  private async createLLMProvider(): Promise<LLMProvider | null> {
    // Try local first (L2 and L3)
    if (this.config.local) {
      const ollama = new OllamaLLMProvider(
        this.config.local.model,
        this.config.local.baseUrl ?? 'http://localhost:11434',
      );
      if (await ollama.isAvailable()) {
        return ollama;
      }
    }

    // Fallback to remote (L3 only)
    if (this.config.remote) {
      if (this.config.remote.provider === 'anthropic') {
        return new AnthropicLLMProvider(
          this.config.remote.apiKey,
          this.config.remote.model,
        );
      }
      if (this.config.remote.provider === 'openai') {
        return new OpenAILLMProvider(
          this.config.remote.apiKey,
          this.config.remote.model,
          this.config.remote.baseUrl,
        );
      }
    }

    return null;
  }

  /**
   * Build text representation of a CodeUnit for embedding.
   */
  private buildCodeText(unit: CodeUnit): string {
    const parts: string[] = [];

    // Add imports for context
    for (const imp of unit.imports) {
      parts.push(`import ${imp.module}`);
    }

    // Add function/method definitions
    for (const def of unit.definitions) {
      parts.push(`${def.kind} ${def.name}`);
    }

    // Add call sites
    for (const call of unit.calls) {
      parts.push(call.callee);
    }

    // Add source snippet (truncated)
    const sourceSnippet = unit.source.slice(0, 2000);
    parts.push(sourceSnippet);

    return parts.join('\n');
  }

  /**
   * Build a focused prompt for the LLM to analyze a code block.
   */
  private buildPrompt(unit: CodeUnit): string {
    return `Analyze this code for AI-generated defects.

File: ${unit.file}
Language: ${unit.language}

Code:
\`\`\`
${unit.source.slice(0, 4000)}
\`\`\`

Check for:
- Hallucinated imports (packages that don't exist)
- Phantom APIs (methods/functions that don't exist on objects)
- Deprecated API usage
- Logic inconsistencies
- Security anti-patterns
- Incomplete implementations (TODOs, stubs)

Respond in JSON format:
{
  "issues": [
    { "line": <line_number>, "severity": "error|warning|info", "message": "<description>", "category": "<category>" }
  ]
}

If no issues found, respond with: { "issues": [] }`;
  }
}

// ─── Constants ─────────────────────────────────────────────────────

const LLM_SYSTEM_PROMPT = `You are a code quality analyzer specialized in detecting AI-generated code defects.
You analyze code and identify issues that are common in AI-generated code:
- Hallucinated packages and APIs
- Outdated/deprecated patterns
- Logic inconsistencies from context window boundaries
- Security vulnerabilities common in AI output
- Over-engineering and unnecessary complexity

Always respond with valid JSON matching the requested format.
Be precise about line numbers.
Only report issues you are confident about.`;
