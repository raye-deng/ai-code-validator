/**
 * DeepHallucinationDetector Tests
 *
 * Tests package existence verification for AI-generated code.
 */

import { describe, it, expect } from 'vitest';
import { DeepHallucinationDetector } from '../src/detectors/deep-hallucination.js';
import type { FileAnalysis, UnifiedIssue } from '../src/types.js';
import { AIDefectCategory } from '../src/types.js';

// ─── Helper ───

function makeFile(path: string, content: string): FileAnalysis {
  return { path, content, language: 'typescript' };
}

function validateIssue(issue: UnifiedIssue) {
  expect(issue.id).toBeTruthy();
  expect(issue.detector).toBe('deep-hallucination');
  expect(issue.category).toBe(AIDefectCategory.HALLUCINATION);
  expect(issue.severity).toBe('critical');
  expect(issue.message).toBeTruthy();
  expect(issue.file).toBeTruthy();
  expect(issue.line).toBeGreaterThan(0);
}

// ─── Tests ───

describe('DeepHallucinationDetector', () => {
  // Use project root so package.json dependencies are available
  const detector = new DeepHallucinationDetector(process.cwd());

  it('should have correct metadata', () => {
    expect(detector.name).toBe('deep-hallucination');
    expect(detector.version).toBe('1.0.0');
    expect(detector.tier).toBe(1);
  });

  it('should detect non-existent package imports', async () => {
    const files = [makeFile('app.ts', `
import { magic } from 'ai-generated-fake-utils';
import { helper } from 'totally-not-real-package';
`)];

    const issues = await detector.detect(files);
    expect(issues.length).toBe(2);
    for (const issue of issues) {
      validateIssue(issue);
      expect(issue.type).toBe('phantom-package');
    }
  });

  it('should NOT flag Node.js built-in modules', async () => {
    const files = [makeFile('server.ts', `
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { readFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Worker } from 'worker_threads';
`)];

    const issues = await detector.detect(files);
    expect(issues.length).toBe(0);
  });

  it('should NOT flag well-known packages', async () => {
    const files = [makeFile('app.ts', `
import React from 'react';
import express from 'express';
import { z } from 'zod';
import lodash from 'lodash';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
`)];

    const issues = await detector.detect(files);
    expect(issues.length).toBe(0);
  });

  it('should NOT flag relative imports', async () => {
    const files = [makeFile('component.ts', `
import { helper } from './utils';
import { config } from '../config';
import { types } from '../../shared/types';
`)];

    const issues = await detector.detect(files);
    expect(issues.length).toBe(0);
  });

  it('should NOT flag path aliases', async () => {
    const files = [makeFile('component.ts', `
import { helper } from '@/utils/helper';
import { config } from '~/config';
import { db } from '#db/client';
`)];

    const issues = await detector.detect(files);
    expect(issues.length).toBe(0);
  });

  it('should NOT flag packages listed in project package.json', async () => {
    // vitest and typescript are in our devDependencies
    const files = [makeFile('test.ts', `
import { describe, it } from 'vitest';
import { glob } from 'glob';
`)];

    const issues = await detector.detect(files);
    expect(issues.length).toBe(0);
  });

  it('should detect hallucinated scoped packages', async () => {
    const files = [makeFile('app.ts', `
import { magic } from '@fake-scope/fake-package';
import { helper } from '@nonexistent/utility-lib';
`)];

    const issues = await detector.detect(files);
    expect(issues.length).toBe(2);
    expect(issues[0].message).toContain('@fake-scope/fake-package');
    expect(issues[1].message).toContain('@nonexistent/utility-lib');
  });

  it('should handle require() syntax', async () => {
    const files = [makeFile('legacy.js', `
const fakeLib = require('ai-hallucinated-library');
const another = require('nonexistent-db-driver');
`)];

    const issues = await detector.detect(files);
    expect(issues.length).toBe(2);
  });

  it('should handle dynamic imports', async () => {
    const files = [makeFile('dynamic.ts', `
const mod = await import('ai-phantom-module');
`)];

    const issues = await detector.detect(files);
    expect(issues.length).toBe(1);
    validateIssue(issues[0]);
  });

  it('should handle empty files', async () => {
    const files = [makeFile('empty.ts', '')];
    const issues = await detector.detect(files);
    expect(issues.length).toBe(0);
  });

  it('should handle files with no imports', async () => {
    const files = [makeFile('utils.ts', `
export function add(a: number, b: number): number {
  return a + b;
}
`)];

    const issues = await detector.detect(files);
    expect(issues.length).toBe(0);
  });

  it('should report correct line numbers', async () => {
    const files = [makeFile('app.ts', `
// Some comment
import React from 'react';
import { fake } from 'totally-fake-package-xyz';
const x = 1;
`)];

    const issues = await detector.detect(files);
    expect(issues.length).toBe(1);
    expect(issues[0].line).toBe(4);
  });

  it('should provide attribution info', async () => {
    const files = [makeFile('app.ts', `
import { x } from 'ai-hallucinated-x';
`)];

    const issues = await detector.detect(files);
    expect(issues.length).toBe(1);
    expect(issues[0].attribution).toBeDefined();
    expect(issues[0].attribution!.rootCause).toContain('AI');
    expect(issues[0].attribution!.frequency).toBe('occasional');
  });
});
