/**
 * Deep Hallucination Detector (V3)
 *
 * Validates that imported packages actually exist by checking:
 * 1. Whether the package is in node_modules/
 * 2. Whether the package is listed in package.json dependencies
 *
 * This goes beyond the basic HallucinationDetector by focusing specifically
 * on package existence verification (without network requests).
 *
 * AI models frequently hallucinate package names that sound plausible
 * but don't actually exist on npm.
 *
 * Implements the unified Detector interface.
 *
 * @since 0.3.0
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Detector, UnifiedIssue, FileAnalysis } from '../types.js';
import { AIDefectCategory } from '../types.js';

// ─── Built-in Module Whitelist ───

const NODE_BUILTINS = new Set([
  'fs', 'path', 'os', 'crypto', 'http', 'https', 'url', 'util',
  'stream', 'events', 'child_process', 'cluster', 'dns', 'net',
  'tls', 'zlib', 'readline', 'querystring', 'assert', 'buffer',
  'console', 'process', 'timers', 'worker_threads', 'perf_hooks',
  'async_hooks', 'v8', 'vm', 'string_decoder', 'punycode', 'dgram',
  'http2', 'inspector', 'module', 'repl', 'constants', 'sys',
  'domain', 'wasi', 'diagnostics_channel', 'trace_events', 'test',
  // node: prefixed
  'node:fs', 'node:path', 'node:os', 'node:crypto', 'node:http',
  'node:https', 'node:url', 'node:util', 'node:stream', 'node:events',
  'node:child_process', 'node:cluster', 'node:dns', 'node:net',
  'node:tls', 'node:zlib', 'node:readline', 'node:querystring',
  'node:assert', 'node:buffer', 'node:console', 'node:process',
  'node:timers', 'node:worker_threads', 'node:perf_hooks',
  'node:async_hooks', 'node:v8', 'node:vm', 'node:test',
  'node:string_decoder', 'node:punycode', 'node:dgram', 'node:http2',
  'node:inspector', 'node:module', 'node:repl',
  // Sub-paths
  'fs/promises', 'timers/promises', 'stream/promises', 'stream/web',
  'stream/consumers', 'node:fs/promises', 'node:timers/promises',
  'node:stream/promises', 'node:stream/web',
]);

// ─── Well-known Package Whitelist ───

const WELL_KNOWN_PACKAGES = new Set([
  // Frameworks
  'react', 'react-dom', 'react-native', 'vue', 'angular', 'svelte',
  'next', 'nuxt', 'gatsby', 'remix', 'astro', 'solid-js', 'preact',
  'express', 'fastify', 'koa', 'hapi', 'nest', '@nestjs/core',
  '@nestjs/common', '@nestjs/platform-express', '@nestjs/testing',
  // Build tools
  'typescript', 'webpack', 'vite', 'rollup', 'esbuild', 'swc',
  'parcel', 'turbo', 'tsup', 'unbuild', 'tsc', 'babel',
  '@swc/core', '@swc/cli',
  // Testing
  'jest', 'vitest', 'mocha', 'chai', 'jasmine', 'cypress',
  'playwright', '@playwright/test', 'puppeteer', 'supertest',
  '@testing-library/react', '@testing-library/jest-dom',
  '@testing-library/user-event', 'sinon', 'nock', 'msw', 'ava',
  'tap', 'nyc', 'c8', 'istanbul',
  // Linting & Formatting
  'eslint', 'prettier', 'stylelint', 'markdownlint',
  '@typescript-eslint/parser', '@typescript-eslint/eslint-plugin',
  'eslint-config-prettier', 'eslint-plugin-import',
  // Database
  'prisma', '@prisma/client', 'typeorm', 'sequelize', 'knex',
  'mongoose', 'mongodb', 'pg', 'mysql', 'mysql2', 'sqlite3',
  'better-sqlite3', 'redis', 'ioredis', 'drizzle-orm',
  // Utilities
  'lodash', 'underscore', 'ramda', 'rxjs', 'date-fns', 'dayjs',
  'moment', 'uuid', 'nanoid', 'chalk', 'debug', 'dotenv',
  'commander', 'yargs', 'inquirer', 'ora', 'glob', 'minimatch',
  'semver', 'yaml', 'toml', 'ini', 'ajv', 'joi', 'zod',
  'class-validator', 'class-transformer',
  // HTTP
  'axios', 'node-fetch', 'got', 'undici', 'ky', 'cross-fetch',
  'superagent', 'request',
  // Auth
  'jsonwebtoken', 'passport', 'bcrypt', 'bcryptjs', 'argon2',
  'helmet', 'cors', 'csurf', 'express-rate-limit',
  // File/Process
  'fs-extra', 'chokidar', 'rimraf', 'mkdirp', 'execa', 'cross-env',
  'concurrently', 'pm2', 'nodemon', 'ts-node', 'tsx',
  // UI libraries
  '@mui/material', '@chakra-ui/react', 'antd', 'tailwindcss',
  '@tailwindcss/forms', '@headlessui/react', '@radix-ui/react-dialog',
  'styled-components', '@emotion/react', '@emotion/styled',
  'framer-motion', 'clsx', 'classnames',
  // State management
  'zustand', 'jotai', 'recoil', 'mobx', 'redux', '@reduxjs/toolkit',
  'react-redux', 'vuex', 'pinia',
  // Types
  '@types/node', '@types/react', '@types/react-dom', '@types/express',
  '@types/jest', '@types/lodash', '@types/uuid',
  // Monorepo
  'lerna', 'changesets', '@changesets/cli', 'nx',
  // Cloud / Infra
  'aws-sdk', '@aws-sdk/client-s3', 'firebase', 'firebase-admin',
  '@google-cloud/storage', 'azure-storage',
  // Logging
  'winston', 'pino', 'bunyan', 'morgan', 'log4js',
  // Misc
  'sharp', 'jimp', 'multer', 'formidable', 'busboy',
  'socket.io', 'ws', 'graphql', '@apollo/server', '@apollo/client',
  'openai', '@anthropic-ai/sdk', 'langchain',
  'puppeteer-core', 'cheerio', 'jsdom',
]);

// ─── Import Extraction ───

interface ImportInfo {
  module: string;
  line: number;
}

function extractImports(source: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // ES module imports
    const esMatch = line.match(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/);
    if (esMatch) {
      imports.push({ module: esMatch[1], line: lineNum });
      continue;
    }

    // Side-effect imports
    const sideEffectMatch = line.match(/import\s+['"]([^'"]+)['"]/);
    if (sideEffectMatch) {
      imports.push({ module: sideEffectMatch[1], line: lineNum });
      continue;
    }

    // Dynamic imports
    const dynamicMatch = line.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (dynamicMatch) {
      imports.push({ module: dynamicMatch[1], line: lineNum });
      continue;
    }

    // CommonJS require
    const requireMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (requireMatch) {
      imports.push({ module: requireMatch[1], line: lineNum });
    }
  }

  return imports;
}

/**
 * Extract the base package name from an import specifier.
 * Returns null for relative imports.
 */
function getPackageName(specifier: string): string | null {
  // Skip relative imports
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null;

  // Skip path aliases
  if (specifier.startsWith('@/') || specifier.startsWith('~/') || specifier.startsWith('#')) return null;

  // Scoped packages: @scope/pkg
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return specifier;
  }

  // Regular packages
  return specifier.split('/')[0];
}

// ─── Package Verification ───

function loadProjectDependencies(projectRoot: string): Set<string> {
  const deps = new Set<string>();

  let dir = projectRoot;
  while (dir !== dirname(dir)) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        const allDeps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
          ...pkg.peerDependencies,
          ...pkg.optionalDependencies,
        };
        for (const name of Object.keys(allDeps)) {
          deps.add(name);
        }
        // Check for workspace root
        if (pkg.workspaces) {
          break; // Found workspace root, stop
        }
        // If inside packages/, also check parent
        if (dir.includes('/packages/') || dir.includes('/apps/')) {
          dir = dirname(dir);
          continue;
        }
      } catch { /* ignore */ }
      break;
    }
    dir = dirname(dir);
  }

  return deps;
}

function packageExistsInNodeModules(packageName: string, projectRoot: string): boolean {
  // Check in project's node_modules
  let dir = projectRoot;
  while (dir !== dirname(dir)) {
    const nmPath = join(dir, 'node_modules', packageName);
    if (existsSync(nmPath)) return true;
    dir = dirname(dir);
  }
  return false;
}

// ─── Main Detector ───

/**
 * DeepHallucinationDetector — verifies imported packages actually exist.
 *
 * Checks imports against:
 * 1. Node.js built-in modules whitelist
 * 2. Well-known packages whitelist (50+ common packages)
 * 3. package.json dependencies
 * 4. node_modules/ directory
 *
 * Does NOT make network requests (kept for speed; npm registry checks
 * can be added in AI Tier or future versions).
 */
export class DeepHallucinationDetector implements Detector {
  readonly name = 'deep-hallucination';
  readonly version = '1.0.0';
  readonly tier = 1 as const;

  private projectRoot: string;
  private projectDeps: Set<string>;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.projectDeps = loadProjectDependencies(projectRoot);
  }

  // ─── V3 Unified Interface ───

  async detect(files: FileAnalysis[]): Promise<UnifiedIssue[]> {
    const allIssues: UnifiedIssue[] = [];
    let globalIndex = 0;

    for (const file of files) {
      const issues = this.analyzeFile(file.path, file.content);
      for (const issue of issues) {
        issue.id = `deep-hallucination:${globalIndex++}`;
        allIssues.push(issue);
      }
    }

    return allIssues;
  }

  // ─── Internal Analysis ───

  private analyzeFile(filePath: string, source: string): UnifiedIssue[] {
    const issues: UnifiedIssue[] = [];
    const imports = extractImports(source);
    const lines = source.split('\n');

    for (const imp of imports) {
      const pkgName = getPackageName(imp.module);
      if (!pkgName) continue; // relative import

      // Skip suppressed lines
      const prevLine = imp.line > 1 ? lines[imp.line - 2] : '';
      if (prevLine.includes('// ai-validator-ignore') || prevLine.includes('// ai-validator-disable')) {
        continue;
      }

      // Skip builtins
      if (NODE_BUILTINS.has(imp.module) || NODE_BUILTINS.has(pkgName)) continue;

      // Skip well-known packages
      if (WELL_KNOWN_PACKAGES.has(pkgName)) continue;

      // Check project dependencies
      if (this.projectDeps.has(pkgName)) continue;

      // Check node_modules
      if (packageExistsInNodeModules(pkgName, this.projectRoot)) continue;

      // Package not found — potential hallucination
      issues.push({
        id: '', // set in detect()
        detector: this.name,
        type: 'phantom-package',
        category: AIDefectCategory.HALLUCINATION,
        severity: 'critical',
        message: `Potentially hallucinated package: '${pkgName}' is not found in dependencies or node_modules`,
        file: filePath,
        line: imp.line,
        suggestion: `Verify that '${pkgName}' is a real npm package. If it exists, run 'npm install ${pkgName}'. If not, it may be an AI hallucination.`,
        fix: {
          description: `Install the package or replace with a real alternative`,
          autoFixable: false,
        },
        confidence: 0.8,
        detectionSource: 'static',
        attribution: {
          rootCause: 'AI models sometimes generate imports for packages that sound plausible but do not exist on npm',
          frequency: 'occasional',
        },
      });
    }

    return issues;
  }
}

export default DeepHallucinationDetector;
