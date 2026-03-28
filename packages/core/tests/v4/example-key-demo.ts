import { SecurityPatternDetector } from '../../src/detectors/v4/security-pattern.js';
import type { DetectorContext } from '../../src/detectors/v4/types.js';
import type { CodeUnit } from '../../src/ir/types.js';
import { createCodeUnit } from '../../src/ir/types.js';

// Demo file with example/placeholder keys that AI commonly generates
const demoSource = `// AI-generated code with example/placeholder keys
import OpenAI from 'openai';

// Scenario 1: OpenAI example key (AI copied from docs)
const openaiKey = "sk-proj-abc123-example";
const openai = new OpenAI({ apiKey: openaiKey });

// Scenario 2: GitHub PAT with example suffix
const githubToken = "ghp_aabbccddeeff00112233445566778899example";

// Scenario 3: Stripe secret key (from Stripe docs)
const stripeSecretKey = "sk_test_abcdefghijklmnopqrstuvwxyzexample";

// Scenario 4: Placeholder secret value
const config = {
  password: "example123",
  apiSecret: "changeme",
  authToken: "your_api_key_here",
};

// Scenario 5: Environment variable with hardcoded fallback
const dbPassword = process.env.DB_PASSWORD || "some-secret-value-here";

// This should NOT be flagged (proper env var usage)
const productionKey = process.env.PRODUCTION_API_KEY;

async function main() {
  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: "Hello" }],
  });
  console.log(completion.choices[0].message);
}

main();`;

function makeUnit(source: string): CodeUnit {
  return createCodeUnit({
    id: 'func:demo.ts:main',
    file: 'demo.ts',
    language: 'typescript',
    kind: 'function',
    location: { startLine: 0, startColumn: 0, endLine: source.split('\n').length, endColumn: 0 },
    source,
  });
}

const detector = new SecurityPatternDetector();
const context: DetectorContext = { projectRoot: '/project', allFiles: ['demo.ts'] };

async function run() {
  const unit = makeUnit(demoSource);
  const results = await detector.detect([unit], context);
  
  console.log('=== Example Key Detection Demo Report ===\n');
  console.log(`File: demo.ts`);
  console.log(`Total detections: ${results.length}\n`);
  
  for (const result of results) {
    console.log(`[${result.severity.toUpperCase()}] ${result.message}`);
    console.log(`  Line: ${result.line}`);
    console.log(`  Pattern: ${result.metadata.patternId}`);
    console.log(`  Confidence: ${result.confidence}`);
    console.log(`  Matched: ${result.metadata.matchedLine}`);
    console.log();
  }
  
  // Summary
  const newPatterns = ['example-api-key', 'example-github-pat', 'placeholder-secret-basic'];
  const newDetections = results.filter(r => newPatterns.includes(r.metadata.patternId));
  
  console.log('=== New Pattern Detections (this update) ===');
  console.log(`Count: ${newDetections.length}`);
  for (const result of newDetections) {
    console.log(`  - ${result.metadata.patternId}: Line ${result.line}`);
  }
}

run().catch(console.error);
