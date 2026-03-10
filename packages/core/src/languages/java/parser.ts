/**
 * Java Language Adapter
 *
 * Regex-based parser for Java source code. No native AST dependencies needed.
 *
 * Supports:
 * - Import extraction (single, wildcard, static imports)
 * - Function/method call extraction
 * - Complexity metrics (cyclomatic, cognitive, nesting via braces)
 * - Deprecated API detection (via deprecated-apis-java.json)
 * - Package verification (Java stdlib + common third-party whitelists)
 *
 * @since 0.3.0
 */

import { createRequire } from 'node:module';
import type { SupportedLanguage } from '../../types.js';
import type {
  LanguageAdapter,
  ASTNode,
  ImportInfo,
  CallInfo,
  PackageVerifyResult,
  DeprecatedInfo,
  ComplexityMetrics,
} from '../types.js';

// ─── Java Standard Library Packages ───

/**
 * Java standard library top-level packages & common sub-packages.
 * Includes java.*, javax.*, and bundled XML packages.
 */
export const JAVA_STDLIB_PACKAGES = new Set([
  // java.*
  'java.lang',
  'java.util',
  'java.io',
  'java.nio',
  'java.net',
  'java.sql',
  'java.time',
  'java.math',
  'java.security',
  'java.crypto',
  'java.text',
  'java.beans',
  'java.awt',
  'java.applet',
  'java.rmi',
  'java.lang.reflect',
  'java.lang.invoke',
  'java.lang.annotation',
  'java.util.concurrent',
  'java.util.stream',
  'java.util.function',
  'java.util.regex',
  'java.util.logging',
  'java.util.zip',
  'java.util.jar',
  'java.nio.file',
  'java.nio.charset',
  'java.nio.channels',
  'java.net.http',
  'java.time.format',
  'java.time.temporal',
  // javax.*
  'javax.swing',
  'javax.servlet',
  'javax.persistence',
  'javax.annotation',
  'javax.xml',
  'javax.json',
  'javax.websocket',
  'javax.naming',
  'javax.crypto',
  'javax.net',
  'javax.net.ssl',
  'javax.management',
  'javax.imageio',
  'javax.sound',
  'javax.sql',
  'javax.tools',
  'javax.script',
  // Bundled XML / W3C
  'org.w3c.dom',
  'org.xml.sax',
]);

// ─── Common Third-Party Packages ───

/**
 * Well-known Java third-party packages from Maven Central.
 * Covers Spring, Apache Commons, Google, testing, data, messaging, cloud, etc.
 */
export const JAVA_COMMON_PACKAGES = new Set([
  // Spring
  'org.springframework',
  'org.springframework.boot',
  'org.springframework.web',
  'org.springframework.data',
  'org.springframework.security',
  // Apache Commons
  'org.apache.commons',
  'org.apache.commons.lang3',
  'org.apache.commons.io',
  'org.apache.commons.collections4',
  // Google
  'com.google.gson',
  'com.google.guava',
  'com.google.common',
  'com.google.protobuf',
  // Logging
  'org.slf4j',
  'ch.qos.logback',
  'org.apache.logging.log4j',
  // Testing
  'org.junit',
  'org.junit.jupiter',
  'org.mockito',
  'org.assertj',
  'org.hamcrest',
  // Serialization / REST
  'com.fasterxml.jackson',
  'com.fasterxml.jackson.databind',
  'com.fasterxml.jackson.core',
  // Network
  'io.netty',
  'com.squareup.okhttp3',
  'org.apache.http',
  'org.apache.httpclient',
  // Messaging / Streaming
  'org.apache.kafka',
  'org.apache.activemq',
  // Reactive
  'io.reactivex',
  'io.reactivex.rxjava3',
  'reactor.core',
  // Lombok
  'org.projectlombok',
  'lombok',
  // Validation
  'javax.validation',
  'jakarta.validation',
  // ORM / Database
  'org.hibernate',
  'com.zaxxer.hikari',
  'org.mybatis',
  'org.jooq',
  // Build tools
  'org.apache.maven',
  'org.gradle',
  // Cloud / AWS
  'com.amazonaws',
  'software.amazon.awssdk',
  // gRPC
  'io.grpc',
  // Search / Analytics
  'org.apache.lucene',
  'org.elasticsearch',
  'co.elastic.clients',
  // Big Data
  'org.apache.spark',
  'org.apache.flink',
  'org.apache.hadoop',
  // Metrics
  'io.micrometer',
  'io.prometheus',
  // Containers / Testing infra
  'org.testcontainers',
  // Databases
  'com.h2database',
  'org.postgresql',
  'com.mysql',
  'org.mongodb',
  'org.mariadb',
  // Redis
  'redis.clients',
  'io.lettuce',
  // ZooKeeper
  'org.apache.zookeeper',
  // Servlet (Jakarta)
  'jakarta.servlet',
  'jakarta.persistence',
  'jakarta.annotation',
]);

// ─── Deprecated API Database ───

interface DeprecatedAPIEntry {
  api: string;
  pattern: string;
  replacement: string;
  deprecated_since: string;
  severity: string;
  reason: string;
}

/** Load deprecated APIs from JSON data file */
function loadDeprecatedAPIs(): DeprecatedAPIEntry[] {
  try {
    const require = createRequire(import.meta.url);
    return require('../../data/deprecated-apis-java.json') as DeprecatedAPIEntry[];
  } catch {
    return [];
  }
}

const JAVA_DEPRECATED_DB = loadDeprecatedAPIs();

// ─── Helpers ───

/**
 * Extract the top-level package prefix from a fully-qualified Java package.
 * e.g. "java.util.List" → "java.util"
 *      "org.springframework.boot.autoconfigure" → "org.springframework"
 */
function getPackagePrefix(fullPkg: string): string {
  const parts = fullPkg.split('.');
  // For java.* / javax.*, use first two segments
  if (parts[0] === 'java' || parts[0] === 'javax') {
    return parts.slice(0, 2).join('.');
  }
  // For org.w3c.dom / org.xml.sax, use first three
  if (parts[0] === 'org' && (parts[1] === 'w3c' || parts[1] === 'xml')) {
    return parts.slice(0, 3).join('.');
  }
  // For third-party: use first two segments (e.g. "org.springframework")
  return parts.slice(0, Math.min(2, parts.length)).join('.');
}

// ─── Java Adapter ───

/**
 * JavaAdapter — LanguageAdapter implementation for Java.
 *
 * Covers: .java
 *
 * Uses regex-based parsing. Java's C-style syntax with explicit import
 * declarations and brace-delimited blocks is well-suited for regex extraction.
 */
export class JavaAdapter implements LanguageAdapter {
  readonly id: SupportedLanguage = 'java';
  readonly extensions = ['.java'];

  /**
   * Parse Java source code.
   * Returns a lightweight AST-like structure with lines and source.
   */
  async parse(source: string, _filePath: string): Promise<ASTNode> {
    return {
      type: 'JavaCompilationUnit',
      lines: source.split('\n'),
      source,
    };
  }

  /**
   * Extract import statements from Java source.
   *
   * Matches:
   * - import java.util.List;
   * - import java.util.*;
   * - import static org.junit.Assert.*;
   * - import static java.lang.Math.PI;
   */
  extractImports(source: string, _ast?: ASTNode): ImportInfo[] {
    const lines = source.split('\n');
    const imports: ImportInfo[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const lineNum = i + 1;

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      // Match: import [static] package.path.ClassName;
      // Match: import [static] package.path.*;
      const importMatch = trimmed.match(
        /^import\s+(static\s+)?([\w.]+(?:\.\*)?)\s*;/
      );
      if (importMatch) {
        const isStatic = !!importMatch[1];
        const fullPath = importMatch[2];

        // Extract the package/module portion (everything except the last segment for class imports)
        // For wildcard imports (java.util.*), module = "java.util"
        // For class imports (java.util.List), module = "java.util"
        // For static imports (org.junit.Assert.assertEquals), module = "org.junit"
        const parts = fullPath.split('.');
        let moduleName: string;
        let bindings: string[] = [];

        if (fullPath.endsWith('.*')) {
          // Wildcard import: java.util.* → module = "java.util", binding = "*"
          moduleName = parts.slice(0, -1).join('.');
          bindings = ['*'];
        } else if (isStatic) {
          // Static import: org.junit.Assert.assertEquals
          // Module is the class's package, binding is the member
          moduleName = parts.slice(0, -1).join('.');
          bindings = [parts[parts.length - 1]];
        } else {
          // Regular import: java.util.List → module = package, binding = class name
          moduleName = parts.slice(0, -1).join('.');
          bindings = [parts[parts.length - 1]];
        }

        // Determine if this is a standard library package
        const prefix = getPackagePrefix(moduleName);
        const isBuiltin = JAVA_STDLIB_PACKAGES.has(prefix) || JAVA_STDLIB_PACKAGES.has(moduleName);

        imports.push({
          module: moduleName,
          bindings,
          line: lineNum,
          isRelative: false, // Java doesn't have relative imports
          isBuiltin,
        });
      }
    }

    return imports;
  }

  /**
   * Extract function/method calls from Java source.
   *
   * Matches patterns like:
   * - System.out.println(...)
   * - obj.method(...)
   * - ClassName.staticMethod(...)
   * - localMethod(...)
   */
  extractCalls(source: string, _ast?: ASTNode): CallInfo[] {
    const lines = source.split('\n');
    const calls: CallInfo[] = [];

    // Java keywords that look like function calls but aren't
    const javaKeywords = new Set([
      'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break',
      'continue', 'return', 'throw', 'try', 'catch', 'finally',
      'new', 'class', 'interface', 'enum', 'extends', 'implements',
      'import', 'package', 'void', 'public', 'private', 'protected',
      'static', 'final', 'abstract', 'synchronized', 'volatile',
      'transient', 'native', 'strictfp', 'assert', 'instanceof',
      'super', 'this', 'default', 'throws',
    ]);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const lineNum = i + 1;

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      // Skip import/package declarations
      if (trimmed.startsWith('import ') || trimmed.startsWith('package ')) {
        continue;
      }

      // Match method calls: word.word.word(
      const methodCallPattern = /(\w+(?:\.\w+)+)\s*\(/g;
      let match: RegExpExecArray | null;
      while ((match = methodCallPattern.exec(line)) !== null) {
        calls.push({
          name: match[1],
          line: lineNum,
          column: match.index + 1,
          isMethodCall: true,
        });
      }

      // Match standalone function calls: name(
      const funcCallPattern = /(?<!\.)(?<!\w)([a-zA-Z_$]\w*)\s*\(/g;
      while ((match = funcCallPattern.exec(line)) !== null) {
        const name = match[1];
        // Skip keywords and type declarations
        if (javaKeywords.has(name)) continue;
        // Skip annotations
        if (line.charAt(match.index - 1) === '@') continue;

        calls.push({
          name,
          line: lineNum,
          column: match.index + 1,
          isMethodCall: false,
        });
      }
    }

    return calls;
  }

  /**
   * Verify if a Java package exists.
   *
   * Checks against Java standard library and common third-party package whitelists.
   * Full Maven Central verification can be added in a later phase.
   */
  async verifyPackage(name: string): Promise<PackageVerifyResult> {
    const prefix = getPackagePrefix(name);

    // Check standard library
    if (JAVA_STDLIB_PACKAGES.has(name) || JAVA_STDLIB_PACKAGES.has(prefix)) {
      return {
        name,
        exists: true,
        checkedAt: Date.now(),
      };
    }

    // Check common third-party packages
    if (JAVA_COMMON_PACKAGES.has(name) || JAVA_COMMON_PACKAGES.has(prefix)) {
      return {
        name,
        exists: true,
        checkedAt: Date.now(),
      };
    }

    // Also check with progressively longer prefixes
    const parts = name.split('.');
    for (let len = 2; len <= parts.length; len++) {
      const candidate = parts.slice(0, len).join('.');
      if (JAVA_STDLIB_PACKAGES.has(candidate) || JAVA_COMMON_PACKAGES.has(candidate)) {
        return {
          name,
          exists: true,
          checkedAt: Date.now(),
        };
      }
    }

    return {
      name,
      exists: false,
      checkedAt: Date.now(),
    };
  }

  /**
   * Check if an API is deprecated.
   * Searches the deprecated-apis-java.json database.
   */
  checkDeprecated(api: string): DeprecatedInfo | null {
    for (const entry of JAVA_DEPRECATED_DB) {
      const regex = new RegExp(entry.pattern);
      if (regex.test(api)) {
        return {
          api: entry.api,
          reason: entry.reason,
          replacement: entry.replacement,
          since: entry.deprecated_since,
        };
      }
    }
    return null;
  }

  /**
   * Compute complexity metrics for Java source code.
   *
   * Uses brace-based nesting detection and regex matching for decision points.
   */
  computeComplexity(source: string, _ast?: ASTNode): ComplexityMetrics {
    const lines = source.split('\n');

    let cyclomatic = 1; // base complexity
    let cognitive = 0;
    let maxNestingDepth = 0;
    let currentDepth = 0;
    let functionCount = 0;
    let inBlockComment = false;

    // Track non-empty, non-comment code lines
    const codeLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Handle block comments
      if (inBlockComment) {
        if (trimmed.includes('*/')) {
          inBlockComment = false;
        }
        continue;
      }
      if (trimmed.startsWith('/*')) {
        inBlockComment = true;
        if (trimmed.includes('*/')) {
          inBlockComment = false;
        }
        continue;
      }

      // Skip single-line comments and empty lines
      if (!trimmed || trimmed.startsWith('//')) continue;

      // Count as code line
      codeLines.push(trimmed);

      // Decision points → cyclomatic complexity
      const ifMatches = (trimmed.match(/\b(if|else\s+if)\s*\(/g) || []).length;
      cyclomatic += ifMatches;

      const forMatches = (trimmed.match(/\b(for|while)\s*\(/g) || []).length;
      cyclomatic += forMatches;

      const caseMatches = (trimmed.match(/\bcase\s+/g) || []).length;
      cyclomatic += caseMatches;

      const catchMatches = (trimmed.match(/\bcatch\s*\(/g) || []).length;
      cyclomatic += catchMatches;

      // Logical operators
      const logicalOps = (trimmed.match(/&&|\|\|/g) || []).length;
      cyclomatic += logicalOps;

      // Ternary operators
      const ternaries = (trimmed.match(/\?[^?:]*:/g) || []).length;
      cyclomatic += ternaries;

      // Track nesting depth via braces
      const opens = (trimmed.match(/\{/g) || []).length;
      const closes = (trimmed.match(/\}/g) || []).length;
      currentDepth += opens - closes;
      if (currentDepth > maxNestingDepth) {
        maxNestingDepth = currentDepth;
      }

      // Cognitive complexity: nested conditions add more
      if (/\b(if|for|while|catch|switch)\b/.test(trimmed)) {
        cognitive += 1 + Math.max(0, currentDepth - 1);
      }

      // Logical operators add cognitive load
      cognitive += logicalOps;

      // Count methods (rough heuristic)
      // Matches: public void method( / private static int method( / protected String method(
      if (/(?:public|private|protected|static|final|abstract|synchronized|native|void|int|long|double|float|boolean|char|byte|short|String|\w+)\s+\w+\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{/.test(trimmed)) {
        functionCount++;
      }
    }

    return {
      cyclomatic,
      cognitive,
      loc: codeLines.length,
      functionCount,
      maxNestingDepth,
    };
  }
}
