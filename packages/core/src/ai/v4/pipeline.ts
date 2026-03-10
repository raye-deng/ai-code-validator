/**
 * AI Scan Pipeline — Two-Stage AI Analysis
 *
 * Orchestrates the multi-stage scan pipeline:
 * - L1 (Fast): Structural only — just passes through structural results
 * - L2 (Standard): + Embedding recall — compare code against defect patterns
 * - L3 (Deep): + LLM deep scan — top-N suspicious blocks → LLM analysis
 *
 * @since 0.4.0
 */

import type { CodeUnit } from '../../ir/types.js';
import type { DetectorResult } from '../../detectors/v4/types.js';
import type {
  AIConfig,
  AIPipelineResult,
  ScanStageResult,
  EmbeddingProvider,
  LLMProvider,
} from './types.js';
import { LocalEmbeddingProvider } from './embedding/local.js';
import { OpenAIEmbeddingProvider } from './embedding/openai.js';
import { OllamaLLMProvider } from './llm/ollama.js';
import { OpenAILLMProvider } from './llm/openai.js';
import { AnthropicLLMProvider } from './llm/anthropic.js';
import { cosineSimilarity, findTopMatches } from './embedding/similarity.js';
import { DEFECT_PATTERNS, getPatternText } from './patterns/defect-patterns.js';

// ─── Constants ─────────────────────────────────────────────────────

/** Default maximum code blocks to send to LLM */
const DEFAULT_MAX_LLM_BLOCKS = 20;

/** Default embedding similarity threshold */
const DEFAULT_SIMILARITY_THRESHOLD = 0.7;

/** LLM system prompt for code review */
const LLM_SYSTEM_PROMPT = `You are an expert AI code reviewer. Analyze the following code block for defects.

Focus on:
- Hallucinated imports/APIs that don't exist
- Deprecated or stale API usage
- Context inconsistencies (contradictory comments, unused variables)
- Security anti-patterns (hardcoded secrets, injection risks)
- Over-engineering and unnecessary abstractions

Respond ONLY with a JSON object in this exact format:
{
  "issues": [
    {
      "line": <line_number>,
      "severity": "error" | "warning" | "info",
      "message": "<description of the issue>",
      "category": "ai-faithfulness" | "code-freshness" | "context-coherence" | "implementation"
    }
  ]
}

If no issues are found, respond with: { "issues": [] }`;

// ─── Code Chunk ────────────────────────────────────────────────────

/** A chunk of code prepared for embedding/LLM analysis */
interface CodeChunk {
  unitId: string;
  file: string;
  startLine: number;
  endLine: number;
  text: string;
}

// ─── AI Scan Pipeline ──────────────────────────────────────────────

/**
 * Two-stage AI scan pipeline.
 *
 * Stage 0 (Structural): Always runs — results passed in from V4 detectors
 * Stage 1 (Embedding): L2+ — compare code chunks against defect patterns
 * Stage 2 (LLM): L3 — send top-N suspicious blocks to LLM for deep analysis
 */
export class AIScanPipeline {
  private embeddingProvider?: EmbeddingProvider;
  private llmProvider?: LLMProvider;
  private maxLLMBlocks: number;
  private similarityThreshold: number;

  constructor(private config: AIConfig) {
    this.maxLLMBlocks = config.maxLLMBlocks ?? DEFAULT_MAX_LLM_BLOCKS;
    this.similarityThreshold = config.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;

    // Initialize embedding provider for L2+
    if (config.sla !== 'L1') {
      this.embeddingProvider = this.createEmbeddingProvider();
    }

    // Initialize LLM provider for L3
    if (config.sla === 'L3') {
      this.llmProvider = this.createLLMProvider();
    }
  }

  /**
   * Run the AI scan pipeline on code units.
   *
   * @param units Parsed code units from the IR layer
   * @param structuralResults Results from structural detectors (Stage 0)
   * @returns Aggregated pipeline results from all stages
   */
  async scan(
    units: CodeUnit[],
    structuralResults: DetectorResult[],
  ): Promise<AIPipelineResult> {
    const stages: ScanStageResult[] = [];
    const pipelineStart = Date.now();

    // Stage 0: Structural (always included)
    const structuralStage: ScanStageResult = {
      stage: 'structural',
      issues: structuralResults,
      durationMs: 0, // already timed externally
    };
    stages.push(structuralStage);

    // Stage 1: Embedding recall (L2+)
    if (this.config.sla !== 'L1' && this.embeddingProvider && units.length > 0) {
      const embeddingStage = await this.runEmbeddingStage(units);
      stages.push(embeddingStage);
    }

    // Stage 2: LLM deep scan (L3)
    if (this.config.sla === 'L3' && this.llmProvider && units.length > 0) {
      const embeddingIssues = stages.find(s => s.stage === 'embedding')?.issues ?? [];
      const llmStage = await this.runLLMStage(units, embeddingIssues);
      stages.push(llmStage);
    }

    const totalDurationMs = Date.now() - pipelineStart;
    const totalIssues = stages.reduce((sum, s) => sum + s.issues.length, 0);

    return {
      stages,
      totalIssues,
      totalDurationMs,
      slaLevel: this.config.sla,
    };
  }

  // ─── Stage 1: Embedding Recall ───────────────────────────────────

  /**
   * Run embedding-based defect pattern matching.
   *
   * Chunks code units into blocks, embeds them and the defect patterns,
   * then finds similar matches above the threshold.
   */
  private async runEmbeddingStage(units: CodeUnit[]): Promise<ScanStageResult> {
    const start = Date.now();
    const issues: DetectorResult[] = [];

    try {
      const provider = this.embeddingProvider!;
      const chunks = this.chunkCodeUnits(units);

      if (chunks.length === 0) {
        return { stage: 'embedding', issues: [], durationMs: Date.now() - start };
      }

      // Prepare pattern texts
      const patternTexts = DEFECT_PATTERNS.map(p => getPatternText(p));
      const chunkTexts = chunks.map(c => c.text);

      // Build vocabulary from combined corpus for local provider
      if (provider instanceof LocalEmbeddingProvider) {
        provider.buildVocabulary([...patternTexts, ...chunkTexts]);
      }

      // Embed patterns and code chunks
      const patternEmbeddings = await provider.embed(patternTexts);
      const chunkEmbeddings = await provider.embed(chunkTexts);

      // For each code chunk, find matching defect patterns
      for (let i = 0; i < chunkEmbeddings.length; i++) {
        const matches = findTopMatches(
          chunkEmbeddings[i],
          patternEmbeddings,
          3, // top 3 pattern matches per chunk
          this.similarityThreshold,
        );

        for (const match of matches) {
          const pattern = DEFECT_PATTERNS[match.index];
          const chunk = chunks[i];

          issues.push({
            detectorId: `embedding:${pattern.id}`,
            severity: pattern.severity,
            category: pattern.category,
            messageKey: `ai.embedding.${pattern.id}`,
            message: `[Embedding match ${(match.score * 100).toFixed(0)}%] ${pattern.description}`,
            file: chunk.file,
            line: chunk.startLine,
            endLine: chunk.endLine,
            confidence: match.score,
          });
        }
      }
    } catch (error) {
      // Embedding failure is non-fatal — log and continue
      const msg = error instanceof Error ? error.message : String(error);
      issues.push({
        detectorId: 'embedding:error',
        severity: 'info',
        category: 'implementation',
        messageKey: 'ai.embedding.error',
        message: `Embedding stage encountered an error: ${msg}`,
        file: '',
        line: 0,
        confidence: 0,
      });
    }

    return {
      stage: 'embedding',
      issues,
      durationMs: Date.now() - start,
    };
  }

  // ─── Stage 2: LLM Deep Scan ─────────────────────────────────────

  /**
   * Run LLM-based deep analysis on the most suspicious code blocks.
   *
   * Takes the top-N blocks (by embedding similarity or structural flags)
   * and sends them to the LLM for detailed analysis.
   */
  private async runLLMStage(
    units: CodeUnit[],
    embeddingIssues: DetectorResult[],
  ): Promise<ScanStageResult> {
    const start = Date.now();
    const issues: DetectorResult[] = [];
    let totalTokensUsed = 0;

    try {
      const provider = this.llmProvider!;
      const chunks = this.chunkCodeUnits(units);

      // Select top-N suspicious chunks based on embedding results
      const suspiciousChunks = this.selectSuspiciousChunks(
        chunks,
        embeddingIssues,
      );

      // Send each chunk to LLM
      for (const chunk of suspiciousChunks) {
        try {
          const prompt = this.buildLLMPrompt(chunk);
          const response = await provider.complete(prompt, {
            system: LLM_SYSTEM_PROMPT,
            temperature: 0.1,
            maxTokens: 2048,
          });

          if (response.usage) {
            totalTokensUsed += response.usage.total;
          }

          // Parse and validate LLM response
          const llmIssues = this.parseLLMResponse(response.content, chunk);
          issues.push(...llmIssues);
        } catch {
          // Individual chunk failure is non-fatal — skip and continue
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      issues.push({
        detectorId: 'llm:error',
        severity: 'info',
        category: 'implementation',
        messageKey: 'ai.llm.error',
        message: `LLM stage encountered an error: ${msg}`,
        file: '',
        line: 0,
        confidence: 0,
      });
    }

    return {
      stage: 'llm',
      issues,
      durationMs: Date.now() - start,
      tokensUsed: totalTokensUsed,
    };
  }

  // ─── Helper: Chunk Code Units ────────────────────────────────────

  /**
   * Split code units into analyzable chunks.
   * Each function/method becomes a chunk; top-level code is chunked by file.
   */
  private chunkCodeUnits(units: CodeUnit[]): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    for (const unit of units) {
      // Use function/method-level units as chunks
      if (
        unit.kind === 'function' ||
        unit.kind === 'method'
      ) {
        chunks.push({
          unitId: unit.id,
          file: unit.file,
          startLine: unit.location.startLine + 1, // Convert to 1-based
          endLine: unit.location.endLine + 1,
          text: unit.source,
        });
      } else if (unit.kind === 'file') {
        // For file-level units, include as single chunk if small enough
        if (unit.source.length <= 8000) {
          chunks.push({
            unitId: unit.id,
            file: unit.file,
            startLine: 1,
            endLine: unit.source.split('\n').length,
            text: unit.source,
          });
        }
      }
    }

    return chunks;
  }

  /**
   * Select the most suspicious chunks for LLM analysis.
   *
   * Prioritizes chunks that had embedding matches, limited by maxLLMBlocks.
   */
  private selectSuspiciousChunks(
    chunks: CodeChunk[],
    embeddingIssues: DetectorResult[],
  ): CodeChunk[] {
    // Collect files flagged by embedding stage
    const flaggedFiles = new Set(
      embeddingIssues
        .filter(i => i.file && i.detectorId !== 'embedding:error')
        .map(i => i.file),
    );

    // Prioritize chunks from flagged files
    const flagged = chunks.filter(c => flaggedFiles.has(c.file));
    const unflagged = chunks.filter(c => !flaggedFiles.has(c.file));

    const selected = [...flagged, ...unflagged];
    return selected.slice(0, this.maxLLMBlocks);
  }

  /**
   * Build a prompt for LLM analysis of a code chunk.
   */
  private buildLLMPrompt(chunk: CodeChunk): string {
    return `Analyze the following code block from file "${chunk.file}" (lines ${chunk.startLine}-${chunk.endLine}):

\`\`\`
${chunk.text}
\`\`\`

Look for AI-generated code defects including hallucinated APIs, deprecated patterns, context inconsistencies, and security issues.`;
  }

  /**
   * Parse and validate the LLM response into DetectorResults.
   *
   * Handles various response formats:
   * - Clean JSON
   * - JSON wrapped in markdown code fences
   * - Malformed JSON (returns empty array)
   */
  private parseLLMResponse(
    content: string,
    chunk: CodeChunk,
  ): DetectorResult[] {
    try {
      // Strip markdown code fences if present
      let jsonStr = content.trim();
      const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
      if (fenceMatch) {
        jsonStr = fenceMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr) as {
        issues?: Array<{
          line?: number;
          severity?: string;
          message?: string;
          category?: string;
        }>;
      };

      if (!parsed.issues || !Array.isArray(parsed.issues)) {
        return [];
      }

      const results: DetectorResult[] = [];

      for (const issue of parsed.issues) {
        // Validate required fields
        if (!issue.message) continue;

        // Validate severity
        const severity = this.validateSeverity(issue.severity);

        // Validate category
        const category = this.validateCategory(issue.category);

        // Validate line number is within chunk range
        const line = typeof issue.line === 'number'
          ? Math.max(chunk.startLine, Math.min(issue.line, chunk.endLine))
          : chunk.startLine;

        results.push({
          detectorId: `llm:${category}`,
          severity,
          category,
          messageKey: `ai.llm.${category}`,
          message: `[LLM] ${issue.message}`,
          file: chunk.file,
          line,
          confidence: 0.8, // LLM issues get moderate confidence
        });
      }

      return results;
    } catch {
      // JSON parse failure — skip this response
      return [];
    }
  }

  /**
   * Validate severity value from LLM response.
   */
  private validateSeverity(
    severity?: string,
  ): 'error' | 'warning' | 'info' {
    if (severity === 'error' || severity === 'warning' || severity === 'info') {
      return severity;
    }
    return 'warning';
  }

  /**
   * Validate category value from LLM response.
   */
  private validateCategory(
    category?: string,
  ): 'ai-faithfulness' | 'code-freshness' | 'context-coherence' | 'implementation' {
    const valid = [
      'ai-faithfulness',
      'code-freshness',
      'context-coherence',
      'implementation',
    ];
    if (category && valid.includes(category)) {
      return category as 'ai-faithfulness' | 'code-freshness' | 'context-coherence' | 'implementation';
    }
    return 'implementation';
  }

  // ─── Provider Factories ──────────────────────────────────────────

  /**
   * Create the embedding provider based on configuration.
   */
  private createEmbeddingProvider(): EmbeddingProvider {
    const embeddingConfig = this.config.embedding;

    if (embeddingConfig?.provider === 'openai' && this.config.remote?.apiKey) {
      return new OpenAIEmbeddingProvider(
        this.config.remote.apiKey,
        embeddingConfig.model ?? 'text-embedding-3-small',
        this.config.remote.baseUrl,
      );
    }

    // Default: local TF-IDF
    return new LocalEmbeddingProvider(512);
  }

  /**
   * Create the LLM provider based on configuration.
   */
  private createLLMProvider(): LLMProvider | undefined {
    // Try remote first (L3 typically uses remote)
    if (this.config.remote) {
      const { provider, model, apiKey, baseUrl } = this.config.remote;
      if (provider === 'anthropic') {
        return new AnthropicLLMProvider(apiKey, model, baseUrl);
      }
      return new OpenAILLMProvider(apiKey, model, baseUrl);
    }

    // Fall back to local Ollama
    if (this.config.local) {
      const { model, baseUrl } = this.config.local;
      return new OllamaLLMProvider(model, baseUrl);
    }

    return undefined;
  }
}
